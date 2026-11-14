export type CertificateDetails = {
  institution: string;
  participant: string;
  course: string;
  date: string;
  serial: string;
};

// Las fuentes estándar PDF con WinAnsi cubren el español. El texto se escribe en
// hexadecimal para que los nombres y títulos nunca se interpreten como operadores.
function pdfText(text: string) {
  return Buffer.from(
    text.replace(/[^\x20-\x7e\xa0-\xff]/g, "?"),
    "latin1",
  ).toString("hex");
}

function lines(value: string, width: number) {
  const words = value
    .normalize("NFC")
    .trim()
    .split(/\s+/)
    .flatMap(
      (word) => word.match(new RegExp(".{1," + width + "}", "gu")) ?? [],
    );
  const result: string[] = [];
  for (const word of words) {
    const last = result.at(-1);
    if (last && last.length + 1 + word.length <= width)
      result[result.length - 1] = last + " " + word;
    else result.push(word);
  }
  return result;
}

export function certificatePdf(details: CertificateDetails) {
  const institution = lines(details.institution, 44);
  const participant = lines(details.participant, 32);
  const course = lines(details.course, 40);
  const height = Math.max(
    480,
    320 +
      institution.length * 20 +
      participant.length * 27 +
      course.length * 22,
  );
  const content = [
    "0.94 0.97 0.96 rg 0 0 720 " + height + " re f",
    "0.04 0.41 0.37 RG 2 w 24 24 672 " + (height - 48) + " re S",
    "0.10 0.18 0.24 rg",
  ];
  let y = height - 72;
  function text(value: string, size: number, bold = false) {
    content.push(
      "BT /" +
        (bold ? "F2" : "F1") +
        " " +
        size +
        " Tf 58 " +
        y +
        " Td <" +
        pdfText(value) +
        "> Tj ET",
    );
    y -= size + 5;
  }
  for (const line of institution) text(line, 15, true);
  y -= 23;
  text("Certificado de taller", 34, true);
  y -= 22;
  text("Otorgado a", 14);
  for (const line of participant) text(line, 22, true);
  y -= 10;
  text("Por su participación en el taller", 14);
  for (const line of course) text(line, 17, true);
  y -= 26;
  text("Fecha de emisión: " + details.date, 13);
  text("Folio: " + details.serial, 12);

  const stream = content.join("\n") + "\n";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 720 " +
      height +
      "] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    "<< /Length " +
      Buffer.byteLength(stream) +
      " >>\nstream\n" +
      stream +
      "endstream",
  ];
  let document = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => {
    const offset = Buffer.byteLength(document);
    document += index + 1 + " 0 obj\n" + object + "\nendobj\n";
    return offset;
  });
  const xref = Buffer.byteLength(document);
  document += "xref\n0 " + (offsets.length + 1) + "\n0000000000 65535 f \n";
  for (const offset of offsets)
    document += String(offset).padStart(10, "0") + " 00000 n \n";
  document +=
    "trailer\n<< /Size " +
    (offsets.length + 1) +
    " /Root 1 0 R >>\nstartxref\n" +
    xref +
    "\n%%EOF\n";
  return Uint8Array.from(Buffer.from(document, "ascii"));
}
