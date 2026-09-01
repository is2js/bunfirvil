export interface HighlightedMessageParts {
  before: string;
  highlight: string;
  after: string;
}

/** 모달 문구를 안전한 text node와 강조 span으로 조립할 수 있게 나눈다. */
export function highlightedMessageParts(message: string, highlightText = ''): HighlightedMessageParts {
  const start = highlightText ? message.indexOf(highlightText) : -1;
  if (start < 0) return { before: message, highlight: '', after: '' };
  return {
    before: message.slice(0, start),
    highlight: highlightText,
    after: message.slice(start + highlightText.length),
  };
}
