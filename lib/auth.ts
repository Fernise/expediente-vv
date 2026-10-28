import {
  getChatGPTUser,
  requireChatGPTUser,
  type ChatGPTUser,
} from "@/app/chatgpt-auth";

const localPreviewUser: ChatGPTUser = {
  id: "local-preview-user",
  displayName: "Equipo piloto",
  email: "piloto@expediente-vv.local",
  fullName: "Equipo piloto",
};

export async function getOptionalActor(): Promise<ChatGPTUser | null> {
  const authenticatedUser = await getChatGPTUser();
  if (authenticatedUser) return authenticatedUser;

  if (process.env.NODE_ENV === "development") {
    return localPreviewUser;
  }

  return null;
}

export async function requireActor(returnTo: string): Promise<ChatGPTUser> {
  const actor = await getOptionalActor();
  if (actor) return actor;
  return requireChatGPTUser(returnTo);
}
