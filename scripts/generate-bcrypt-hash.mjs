import { hash } from 'bcryptjs'

const password = process.argv[2]
const roundsArg = process.argv[3]
const rounds = Number.parseInt(roundsArg || '12', 10)

if (!password) {
  console.error('Uso: node scripts/generate-bcrypt-hash.mjs <password> [rounds]')
  process.exit(1)
}

if (Number.isNaN(rounds) || rounds < 4 || rounds > 15) {
  console.error('rounds debe ser un numero entre 4 y 15')
  process.exit(1)
}

const bcryptHash = await hash(password, rounds)
console.log(bcryptHash)
