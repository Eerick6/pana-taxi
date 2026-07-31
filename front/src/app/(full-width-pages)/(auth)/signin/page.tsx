import SignInForm from "@/components/auth/SignInForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Iniciar sesión — Pana Taxi",
  description: "Portal de acceso para cooperativas y equipo administrativo de Pana Taxi.",
};

export default function SignIn() {
  return <SignInForm />;
}
