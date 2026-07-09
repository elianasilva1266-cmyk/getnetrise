// Gerador de BR Code EMV (PIX estático "copia e cola")
// Baseado no Manual do BR Code do BCB.

function tlv(id: string, value: string) {
  const len = value.length.toString().padStart(2, "0");
  return `${id}${len}${value}`;
}

function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) crc = ((crc << 1) ^ 0x1021) & 0xffff;
      else crc = (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

// Remove acentos e caracteres não ASCII para conformidade com o padrão
function sanitize(str: string, max: number) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .toUpperCase()
    .slice(0, max);
}

export interface PixStaticParams {
  key: string;
  amount?: number;
  merchantName?: string;
  merchantCity?: string;
  txid?: string;
}

export function buildPixStatic({
  key,
  amount,
  merchantName = "RECEBEDOR PIX",
  merchantCity = "SAO PAULO",
  txid = "***",
}: PixStaticParams): string {
  const gui = tlv("00", "br.gov.bcb.pix");
  const keyTlv = tlv("01", key.trim());
  const merchantAccount = tlv("26", gui + keyTlv);

  const cleanTxid = sanitize(txid, 25) || "***";
  const additional = tlv("62", tlv("05", cleanTxid));

  const payload =
    tlv("00", "01") +
    merchantAccount +
    tlv("52", "0000") +
    tlv("53", "986") +
    (amount && amount > 0 ? tlv("54", amount.toFixed(2)) : "") +
    tlv("58", "BR") +
    tlv("59", sanitize(merchantName, 25)) +
    tlv("60", sanitize(merchantCity, 15)) +
    additional;

  const toCrc = payload + "6304";
  return toCrc + crc16(toCrc);
}
