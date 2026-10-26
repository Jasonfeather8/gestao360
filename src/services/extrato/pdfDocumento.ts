import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

let workerConfigurado = false;

export function configurarWorkerPdf(): void {
  if (workerConfigurado) return;
  GlobalWorkerOptions.workerSrc = workerSrc;
  workerConfigurado = true;
}

export async function contarPaginas(arquivo: File): Promise<number> {
  configurarWorkerPdf();
  const tarefa = getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) });

  try {
    const documento = await tarefa.promise;
    return documento.numPages;
  } finally {
    await tarefa.destroy();
  }
}
