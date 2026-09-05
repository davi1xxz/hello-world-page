import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const targetUrl = process.argv[2] || 'https://flow-hits.web.app/entrar'
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const debugPort = 9333
const profilePath = mkdtempSync(join(tmpdir(), 'flowhits-auth-check-'))
const chrome = spawn(chromePath, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profilePath}`,
  'about:blank',
], { stdio: 'ignore', windowsHide: true })

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

const loadPageTarget = async () => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`)
      const targets = await response.json()
      const page = targets.find((target) => target.type === 'page')
      if (page) return page
    } catch {
      // O Chrome ainda esta iniciando.
    }
    await wait(200)
  }
  throw new Error('Chrome nao disponibilizou o protocolo de teste.')
}

let socket

try {
  const page = await loadPageTarget()
  socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })

  let commandId = 0
  const pending = new Map()
  const gsiResponses = []
  const pageErrors = []

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message)
      pending.delete(message.id)
      return
    }
    if (message.method === 'Network.responseReceived' && message.params.response.url.includes('accounts.google.com/gsi/button')) {
      gsiResponses.push({ status: message.params.response.status, url: message.params.response.url })
    }
    if (message.method === 'Runtime.exceptionThrown') {
      pageErrors.push(message.params.exceptionDetails.text)
    }
  })

  const send = (method, params = {}) => new Promise((resolve) => {
    commandId += 1
    pending.set(commandId, resolve)
    socket.send(JSON.stringify({ id: commandId, method, params }))
  })

  await send('Network.enable')
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Page.navigate', { url: targetUrl })
  await wait(8000)

  const measurementResponse = await send('Runtime.evaluate', {
    expression: `(() => {
      const container = document.querySelector('.google-gsi-layer')
      const button = container?.querySelector('[role="button"], iframe')
      return {
        containerWidth: container?.getBoundingClientRect().width || 0,
        containerHeight: container?.getBoundingClientRect().height || 0,
        buttonWidth: button?.getBoundingClientRect().width || 0,
      }
    })()`,
    returnByValue: true,
  })
  const measurement = measurementResponse.result?.result?.value

  const latestGsiResponse = gsiResponses.at(-1)
  if (!measurement || measurement.containerWidth < 200 || measurement.containerHeight < 36) {
    throw new Error(`Dimensao inesperada do espaco do Google: ${JSON.stringify(measurement)}`)
  }
  console.log(`AUTH_PAGE_LAYOUT_OK: container ${measurement.containerWidth}x${measurement.containerHeight}px; botao ${measurement.buttonWidth || 'carregando'}px.`)
  if (!latestGsiResponse) throw new Error('A pagina nao tentou carregar o botao do Google.')
  const gsiRequest = new URL(latestGsiResponse.url)
  if (gsiRequest.searchParams.get('size') !== 'large') {
    throw new Error('O Google nao recebeu a configuracao de tamanho grande.')
  }
  if (latestGsiResponse.status !== 200) throw new Error(`Google GSI respondeu HTTP ${latestGsiResponse.status}.`)
  if (pageErrors.length) throw new Error(`A pagina registrou erro JavaScript: ${pageErrors.join('; ')}`)

  console.log(`AUTH_PAGE_OK: ${targetUrl} carregou o Google GSI com HTTP 200 e sem excecao JavaScript.`)
} catch (error) {
  console.error(`AUTH_PAGE_FALHOU: ${error.message}`)
  process.exitCode = 1
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close()
  chrome.kill()
}
