import { notFound } from "next/navigation";
import PdfWorkspace from "@/components/PdfWorkspace";
import ToolWorkspace from "@/components/ToolWorkspace";
import TextWorkspace from "@/components/TextWorkspace";
import { tools, ToolSlug } from "@/lib/tools";
export function generateStaticParams() {
  return Object.keys(tools).map((tool) => ({ tool }));
}
export default async function ToolPage({
  params,
}: {
  params: Promise<{ tool: string }>;
}) {
  const { tool } = await params;
  if (!Object.hasOwn(tools, tool)) notFound();
  if (tool === "pdf-editor" || tool === "merge-pdf")
    return <PdfWorkspace key={tool} slug={tool} />;
  if (tool === "text-humanizer" || tool === "ai-detector")
    return <TextWorkspace key={tool} slug={tool} />;
  return <ToolWorkspace slug={tool as ToolSlug} />;
}
