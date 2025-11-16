import { Marked } from 'marked';
import TerminalRenderer from 'marked-terminal';

const renderer = new TerminalRenderer({
  reflowText: false,
  width: process.stdout.columns ? Math.max(20, process.stdout.columns - 2) : undefined,
  tab: 2,
});

const markedWithTerminal = new Marked({ renderer: renderer as unknown as any });

/**
 * Render markdown to ANSI-colored text suitable for a TTY.
 */
export function renderMarkdownAnsi(markdown: string): string {
  return markedWithTerminal.parse(markdown) as string;
}
