import { send } from './_lib/http.js';

// Saat eşitleme: tüm istemciler aynı çizelgeyi izlesin diye sunucu saati.
export default function handler(req, res) {
  send(res, 200, { t: Date.now() });
}
