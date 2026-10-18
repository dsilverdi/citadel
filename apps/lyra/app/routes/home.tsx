import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { authenticate } from "@citadel/auth";
import { listConversations } from "../../server/api";
import { idSchema } from "../../server/contracts";
import { snapshot } from "../../server/repository";
import { ChatApp } from "../components/chat-app";

export function meta() {
  return [
    { title: "Lyra · Citadel" },
    {
      name: "description",
      content: "Chat, research, and reports with sources.",
    },
  ];
}
export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env;
  const identity = await authenticate(request, env);
  const conversations = await listConversations(env, identity.subject);
  const selected = idSchema.safeParse(new URL(request.url).searchParams.get("c"));
  const initialSnapshot = selected.success
    ? await snapshot(env, selected.data, identity.subject)
    : null;
  return {
    conversations,
    initialSnapshot,
    email: identity.email,
    demo: env.APP_ENV === "local" && env.MOCK_AI === "true",
    configured: !!env.OPENAI_API_KEY || (env.APP_ENV === "local" && env.MOCK_AI === "true"),
  };
}
export default function Home() {
  return <ChatApp initial={useLoaderData<typeof loader>()} />;
}
