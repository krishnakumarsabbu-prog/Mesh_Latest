import React from 'react';
import DOMPurify from 'dompurify';
import { cn } from '@/lib/utils';

interface MarkdownMessageProps {
  content: string;
  className?: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseMarkdown(text: string): string {
  let html = escapeHtml(text);

  // Code blocks
  html = html.replace(/```([\w]*)\n?([\s\S]*?)```/g, (_match, _lang, code) => {
    return `<pre class="md-code-block"><code>${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');

  // Headers
  html = html.replace(/^\s*#{3}\s(.+)$/gm, '<h3 class="md-h3">$1</h3>');
  html = html.replace(/^\s*#{2}\s(.+)$/gm, '<h2 class="md-h2">$1</h2>');
  html = html.replace(/^\s*#{1}\s(.+)$/gm, '<h1 class="md-h1">$1</h1>');

  // Bold / italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Citation tags: [source: X] or [data: X] → rendered as a small badge
  html = html.replace(
    /\[(source|data|via|from):\s*([^\]]+)\]/gi,
    '<span class="md-citation" data-source="$2">$2</span>',
  );

  // Lists
  const lines = html.split('\n');
  const processedLines: string[] = [];
  let inList = false;

  for (const line of lines) {
    const bulletMatch = line.match(/^[-*+]\s(.+)/);
    if (bulletMatch) {
      if (!inList) {
        processedLines.push('<ul class="md-list">');
        inList = true;
      }
      processedLines.push(`<li class="md-list-item">${bulletMatch[1]}</li>`);
    } else {
      if (inList) {
        processedLines.push('</ul>');
        inList = false;
      }
      processedLines.push(line);
    }
  }
  if (inList) processedLines.push('</ul>');

  html = processedLines.join('\n');

  html = html.replace(/\n{2,}/g, '</p><p class="md-p">');
  html = html.replace(/\n/g, '<br/>');

  if (!html.startsWith('<')) {
    html = `<p class="md-p">${html}</p>`;
  }

  return html;
}

export function MarkdownMessage({ content, className }: MarkdownMessageProps) {
  const html = DOMPurify.sanitize(parseMarkdown(content), {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'code', 'pre', 'ul', 'li', 'h1', 'h2', 'h3', 'span'],
    ALLOWED_ATTR: ['class', 'data-source'],
  });

  return (
    <div
      className={cn('markdown-body', className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
