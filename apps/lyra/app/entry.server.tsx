import { renderToReadableStream } from "react-dom/server";
import { ServerRouter, type EntryContext } from "react-router";

export default async function handleRequest(
  request: Request,
  status: number,
  headers: Headers,
  context: EntryContext,
) {
  const stream = await renderToReadableStream(
    <ServerRouter context={context} url={request.url} />,
    {
      signal: request.signal,
      onError() {
        status = 500;
        console.error("Lyra page rendering failed");
      },
    },
  );
  headers.set("content-type", "text/html; charset=utf-8");
  return new Response(stream, { status, headers });
}
