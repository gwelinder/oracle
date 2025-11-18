import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGeminiClient, resolveGeminiModelId } from '../src/oracle/gemini.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const { mockGetGenerativeModel, mockGenerateContent, mockGenerateContentStream } = vi.hoisted(() => {
  const mockGenerateContent = vi.fn();
  const mockGenerateContentStream = vi.fn();
  const mockGetGenerativeModel = vi.fn().mockReturnValue({
    generateContent: mockGenerateContent,
    generateContentStream: mockGenerateContentStream,
  });
  return { mockGetGenerativeModel, mockGenerateContent, mockGenerateContentStream };
});

vi.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: vi.fn().mockImplementation(function () {
      return {
        getGenerativeModel: mockGetGenerativeModel,
      };
    }),
    HarmCategory: {
        HARM_CATEGORY_HARASSMENT: 'HARM_CATEGORY_HARASSMENT',
        HARM_CATEGORY_HATE_SPEECH: 'HARM_CATEGORY_HATE_SPEECH',
        HARM_CATEGORY_SEXUALLY_EXPLICIT: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        HARM_CATEGORY_DANGEROUS_CONTENT: 'HARM_CATEGORY_DANGEROUS_CONTENT'
    },
    HarmBlockThreshold: {
        BLOCK_NONE: 'BLOCK_NONE'
    }
  };
});

describe('Gemini Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with the correct model', () => {
    createGeminiClient('fake-key');
    expect(GoogleGenerativeAI).toHaveBeenCalledWith('fake-key');
    expect(mockGetGenerativeModel).toHaveBeenCalledWith({ model: 'gemini-3-pro-preview' });
  });

  it('maps 3-pro through resolver', () => {
    expect(resolveGeminiModelId('gemini-3-pro')).toBe('gemini-3-pro-preview');
  });

  it('adapts create request correctly', async () => {
    const client = createGeminiClient('fake-key');
    const mockResponse = {
      response: {
        candidates: [
          {
            content: {
              parts: [{ text: 'Gemini response' }],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 20,
        },
      },
    };
    mockGenerateContent.mockResolvedValue(mockResponse);

    const requestBody = {
      model: 'gemini-3-pro',
      instructions: 'System prompt',
      input: [
        {
          role: 'user',
          content: [{ type: 'input_text', text: 'User prompt' }],
        },
      ],
      max_output_tokens: 100,
    } as any;

    const result = await client.responses.create(requestBody);

    expect(mockGenerateContent).toHaveBeenCalledWith({
      systemInstruction: 'System prompt',
      contents: [
        {
          role: 'user',
          parts: [{ text: 'User prompt' }],
        },
      ],
      tools: undefined,
      generationConfig: {
        maxOutputTokens: 100,
      },
      safetySettings: expect.any(Array),
    });

    expect(result).toEqual({
      id: expect.stringMatching(/^gemini-/),
      status: 'completed',
      output_text: ['Gemini response'],
      output: [{ type: 'text', text: 'Gemini response' }],
      usage: {
        input_tokens: 10,
        output_tokens: 20,
        total_tokens: 30,
      },
    });
  });

  it('adapts streaming request correctly', async () => {
    const client = createGeminiClient('fake-key');
    
    const mockStream = {
      stream: (async function* () {
        yield { candidates: [{ content: { parts: [{ text: 'Chunk 1' }, { text: ' A' }] } }] };
        yield { candidates: [{ content: { parts: [{ text: 'Chunk 2' }] } }] };
      })(),
      response: Promise.resolve({
         candidates: [
            {
               content: {
                  parts: [{ text: 'Chunk 1 AChunk 2' }]
               }
            }
         ],
         usageMetadata: {
            promptTokenCount: 5,
            candidatesTokenCount: 5
         }
      })
    };

    mockGenerateContentStream.mockResolvedValue(mockStream);

    const requestBody = {
      model: 'gemini-3-pro',
      instructions: 'System',
      input: [
        {
          role: 'user',
          content: [{ type: 'input_text', text: 'Stream me' }],
        },
      ],
      tools: [{ type: 'web_search_preview' }],
    } as any;

    const stream = await client.responses.stream(requestBody);
    const chunks: string[] = [];

    for await (const event of stream) {
      if (event.type === 'chunk' && event.delta) {
        chunks.push(event.delta);
      }
    }

    expect(chunks).toEqual(['Chunk 1 A', 'Chunk 2']);

    expect(mockGenerateContentStream).toHaveBeenCalledWith(expect.objectContaining({
      tools: [{ googleSearch: {} }],
    }));
    
    const final = await stream.finalResponse();
    expect(final.usage).toEqual({
        input_tokens: 5,
        output_tokens: 5,
        total_tokens: 10
    });
  });

  it('includes system prompt even when empty tools array is provided', async () => {
    const client = createGeminiClient('fake-key');
    mockGenerateContent.mockResolvedValue({
      response: {
        candidates: [{ content: { parts: [{ text: 'ok' }] } }],
        usageMetadata: {},
      },
    });

    const requestBody = {
      model: 'gemini-3-pro',
      instructions: 'Sys',
      input: [
        {
          role: 'user',
          content: [{ type: 'input_text', text: 'Ping' }],
        },
      ],
      tools: [],
    } as any;

    await client.responses.create(requestBody);
    expect(mockGenerateContent.mock.calls[0]?.[0]).toMatchObject({
      systemInstruction: 'Sys',
      tools: [],
    });
  });
});
