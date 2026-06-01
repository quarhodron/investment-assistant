import ReactMarkdown from "react-markdown";

interface Props {
  content: string;
}

export default function MarkdownOutput({ content }: Props) {
  return (
    <div className="text-sm leading-relaxed text-white/85 [&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-base [&_h1]:font-bold [&_h1]:text-white [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-white [&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:font-semibold [&_h3]:text-white/90 [&_li]:ml-4 [&_ol]:my-2 [&_ol]:list-decimal [&_p]:mb-2 [&_strong]:font-semibold [&_strong]:text-white [&_ul]:my-2 [&_ul]:list-disc">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
