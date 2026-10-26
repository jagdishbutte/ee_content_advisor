"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DownloadButton({ content, filename, label }: { content: string; filename: string; label: string }) {
  function download() {
    const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: filename });
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button size="sm" onClick={download}>
      <Download />
      {label}
    </Button>
  );
}
