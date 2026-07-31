import { Metadata } from "next";
import AdminChatPanel from "@/features/chat/AdminChatPanel";

export const metadata: Metadata = { title: "Chats | Pana Taxi" };

export default function ChatsPage() {
  return <AdminChatPanel />;
}
