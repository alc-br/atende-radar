// "Piper falso" dos testes: aceita os mesmos argumentos do Piper (--model, --output_file), lê o texto do stdin e grava
// um WAV válido de 2,5 s de silêncio. Cada chamada acrescenta uma linha em FAKE_PIPER_LOG, para o teste provar que o
// áudio é gerado UMA vez e depois reaproveitado do cache. Não roda nada do Piper de verdade.
import { appendFileSync, writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const out = args[args.indexOf('--output_file') + 1]
if (!out || args.indexOf('--output_file') < 0 || args.indexOf('--model') < 0) {
  process.stderr.write('uso: fake-piper --model <voz> --output_file <arquivo.wav>\n')
  process.exit(2)
}

let text = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (d) => (text += d))
process.stdin.on('end', () => {
  const rate = 8000
  const samples = Math.round(rate * 2.5)
  const data = samples * 2 // 16 bits, mono
  const wav = Buffer.alloc(44 + data)
  wav.write('RIFF', 0)
  wav.writeUInt32LE(36 + data, 4)
  wav.write('WAVE', 8)
  wav.write('fmt ', 12)
  wav.writeUInt32LE(16, 16) // tamanho do bloco fmt
  wav.writeUInt16LE(1, 20) // PCM
  wav.writeUInt16LE(1, 22) // mono
  wav.writeUInt32LE(rate, 24)
  wav.writeUInt32LE(rate * 2, 28) // bytes por segundo
  wav.writeUInt16LE(2, 32) // bytes por amostra
  wav.writeUInt16LE(16, 34) // bits por amostra
  wav.write('data', 36)
  wav.writeUInt32LE(data, 40)
  writeFileSync(out, wav)
  if (process.env.FAKE_PIPER_LOG) appendFileSync(process.env.FAKE_PIPER_LOG, `${text.trim().length}\n`)
})
