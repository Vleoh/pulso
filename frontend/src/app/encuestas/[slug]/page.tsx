import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PollExperience } from "@/components/PollExperience";
import { getPollBySlug } from "@/lib/api";

type PollPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PollPageProps): Promise<Metadata> {
  const { slug } = await params;
  const payload = await getPollBySlug(slug);
  if (!payload?.item) {
    return {
      title: "Encuesta | Pulso Pais",
      description: "Encuesta digital de Pulso Pais.",
    };
  }

  return {
    title: `${payload.item.question} | Pulso Pais`,
    description: payload.item.description ?? payload.item.title,
    openGraph: {
      title: payload.item.question,
      description: payload.item.description ?? payload.item.title,
      images: payload.item.coverImageUrl ? [{ url: payload.item.coverImageUrl }] : undefined,
    },
  };
}

export default async function PollPage({ params }: PollPageProps) {
  const { slug } = await params;
  const payload = await getPollBySlug(slug);

  if (!payload?.item) {
    notFound();
  }

  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.API_INTERNAL_URL ??
    process.env.API_URL ??
    "http://localhost:8080";

  return (
    <PollExperience
      initialPoll={payload.item}
      initialSelectedOptionId={payload.selectedOptionId ?? null}
      apiBaseUrl={apiBaseUrl}
    />
  );
}
