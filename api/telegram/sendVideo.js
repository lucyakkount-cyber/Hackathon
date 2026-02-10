import { relayTelegramMethod } from './_relay.js'

export default async function handler(req, res) {
  return relayTelegramMethod(req, res, 'sendVideo')
}
