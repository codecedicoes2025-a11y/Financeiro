/** Senha de PDF ausente ou errada. */
export class PdfPasswordError extends Error {
  constructor(public tried: number) {
    super(tried > 0 ? "A senha salva não abriu este PDF. Confira as senhas em Configurações › Gemini." : "Este PDF tem senha. Cadastre a senha em Configurações › Gemini.");
  }
}

type TextItem = { str: string; transform: number[]; width: number };

const isPasswordError = (e: unknown) => !!e && typeof e === "object" && (e as { name?: string }).name === "PasswordException";

/**
 * Abre o PDF NESTE aparelho (com as senhas salvas, se precisar) e devolve o texto, linha por linha.
 * Nada é enviado para fora: a senha só é usada aqui.
 */
export async function readPdfText(file: File, passwords: string[]): Promise<{ text: string; pages: number; usedPassword: boolean }> {
  // Versão "legacy" do pdf.js: funciona também em Safari/iOS mais antigos.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const bytes = new Uint8Array(await file.arrayBuffer());

  let task: ReturnType<typeof pdfjs.getDocument> | null = null;
  const open = async (password?: string) => {
    task?.destroy();
    task = pdfjs.getDocument({ data: bytes.slice(), password });
    return task.promise;
  };

  let doc: Awaited<ReturnType<typeof open>> | null = null;
  let usedPassword = false;
  try {
    doc = await open();
  } catch (e) {
    if (!isPasswordError(e)) throw e;
    for (const pw of passwords.filter(Boolean)) {
      try {
        doc = await open(pw);
        usedPassword = true;
        break;
      } catch (err) {
        if (!isPasswordError(err)) throw err;
      }
    }
    if (!doc) throw new PdfPasswordError(passwords.filter(Boolean).length);
  }

  const out: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const items = (content.items as unknown as TextItem[]).filter((i) => typeof i.str === "string" && i.str.trim() !== "" && Array.isArray(i.transform));
    // Agrupa em linhas pela posição vertical e ordena cada linha da esquerda para a direita.
    items.sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]);
    const lines: TextItem[][] = [];
    for (const it of items) {
      const last = lines[lines.length - 1];
      if (last && Math.abs(last[0].transform[5] - it.transform[5]) < 3) last.push(it);
      else lines.push([it]);
    }
    for (const line of lines) {
      line.sort((a, b) => a.transform[4] - b.transform[4]);
      let s = "";
      let prevEnd = -Infinity;
      for (const it of line) {
        const x = it.transform[4];
        const gap = x - prevEnd;
        s += s ? (gap > 8 ? "   " : gap > 1 ? " " : "") + it.str.trim() : it.str.trim();
        prevEnd = x + it.width;
      }
      out.push(s);
    }
    out.push("");
  }
  const pages = doc.numPages;
  await (task as ReturnType<typeof pdfjs.getDocument> | null)?.destroy();
  return { text: out.join("\n").slice(0, 400_000), pages, usedPassword };
}
