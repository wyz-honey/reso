import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const mdComponents = {
  a: ({ href, children, className, ...rest }) => (
    <a href={href} className={className} target="_blank" rel="noreferrer noopener" {...rest}>
      {children}
    </a>
  ),
};

export default function AssistantMarkdown({ text }) {
  const src = typeof text === 'string' ? text : '';
  return (
    <div className="agent-md-root">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
        {src.length ? src : '\u200b'}
      </ReactMarkdown>
    </div>
  );
}
