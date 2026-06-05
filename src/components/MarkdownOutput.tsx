import ReactMarkdown from "react-markdown";

const proseClasses = [
  "max-w-none text-[0.95rem] leading-[1.65] text-foreground/90",
  // headings — editorial serif, larger than body
  "[&_h1]:font-display [&_h1]:text-foreground [&_h1]:mt-8 [&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:font-normal [&_h1]:tracking-tight",
  "[&_h2]:font-display [&_h2]:text-foreground [&_h2]:mt-7 [&_h2]:mb-2.5 [&_h2]:text-xl [&_h2]:font-normal [&_h2]:tracking-tight",
  "[&_h3]:font-display [&_h3]:text-foreground [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-normal",
  "[&_h4]:text-foreground [&_h4]:mt-5 [&_h4]:mb-1.5 [&_h4]:text-base [&_h4]:font-semibold",
  // paragraphs & emphasis
  "[&_p]:my-3.5",
  "[&_strong]:text-foreground [&_strong]:font-semibold",
  "[&_em]:italic",
  // links
  "[&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-2 [&_a]:decoration-foreground/30 hover:[&_a]:decoration-foreground",
  // lists
  "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:marker:text-muted-foreground/60",
  "[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:marker:text-muted-foreground/70 [&_ol]:marker:font-mono [&_ol]:marker:text-xs",
  "[&_li]:my-1 [&_li]:pl-1",
  // blockquote — editorial pull quote
  "[&_blockquote]:border-l-2 [&_blockquote]:border-foreground/30 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-foreground/80 [&_blockquote]:my-4",
  // code
  "[&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.85em] [&_code]:font-mono",
  "[&_pre]:bg-muted [&_pre]:overflow-x-auto [&_pre]:p-4 [&_pre]:text-[0.85em] [&_pre]:my-4",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
  // tables — tabular numerals, hairline borders
  "[&_table]:my-5 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm [&_table]:[font-variant-numeric:tabular-nums]",
  "[&_th]:border-b-2 [&_th]:border-foreground/40 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-medium [&_th]:text-foreground",
  "[&_td]:border-b [&_td]:border-border/60 [&_td]:px-3 [&_td]:py-2 [&_td]:align-top",
  // horizontal rule
  "[&_hr]:my-6 [&_hr]:border-foreground/15",
].join(" ");

interface Props {
  content: string;
}

export default function MarkdownOutput({ content }: Props) {
  return (
    <div className={proseClasses}>
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
