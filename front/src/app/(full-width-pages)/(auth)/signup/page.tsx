import SignUpForm from "@/components/auth/SignUpForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pana Taxi",
  description: "Panel de administración Pana Taxi",
};

export default function SignUp() {
  return <SignUpForm />;
}
