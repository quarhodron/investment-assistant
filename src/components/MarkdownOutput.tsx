import ReactMarkdown from "react-markdown";

interface Props {
  content: string;
}

export default function MarkdownOutput({ content }: Props) {
  return (
    <div className="prose prose-invert prose-sm max-w-none text-slate-200">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
