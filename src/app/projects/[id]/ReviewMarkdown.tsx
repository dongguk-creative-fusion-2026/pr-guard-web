import Markdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

// 리뷰 본문은 GitHub 코멘트와 같은 마크다운(+ <details>, <sub>)이다.
// LLM 출력이 섞이므로 raw HTML 을 허용하되 sanitize 로 스크립트·이벤트 속성은 걸러낸다.
export function ReviewMarkdown({ children }: { children: string }) {
  return (
    <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeSanitize]}>
      {children}
    </Markdown>
  );
}
