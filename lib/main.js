/*
Copyright 2019 Adobe Inc. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

const { app, BrowserWindow } = require('electron')
const url = require('url')
const querystring = require('querystring')

if (app.dock) {
  app.dock.hide()
}

function _parseQuery (urlString) {
  return querystring.parse(new url.URL(urlString).query)
}

function _failApp (message, state) {
  process.stderr.write(JSON.stringify({ message, state }))
  app.exit(1)
}

function _succeedApp (code, state) {
  process.stdout.write(JSON.stringify({ code, state }))
  app.exit(0)
}

function getArg (argv, idx, message, defaultValue) {
  if (argv.length > idx) {
    return argv[idx]
  }

  if (defaultValue !== undefined) {
    return defaultValue
  }

  _failApp(message)
}

const authUrl = getArg(process.argv, 2, 'Missing authentication URL', undefined)
const callbackUrl = getArg(process.argv, 3, 'Missing callback URL', undefined)
const force = getArg(process.argv, 4, undefined, 'false') === 'true'

function handleCallback (redirectUrl) {
  if (!redirectUrl.startsWith(callbackUrl)) {
    return
  }

  // dereference window to prevent on close handler trying to terminate
  win = null

  // If there is a code, proceed to get token from github
  const query = _parseQuery(redirectUrl)
  if (query.code) {
    _succeedApp(query.code, query.state)
  } else if (query.error) {
    _failApp(query.error, query.state)
  } else {
    _failApp(`Unexpected Callback received: ${redirectUrl}`, query.state)
  }
}

let win

function createWindow () {
  win = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    webPreferences: {
      nodeIntegration: false
    }
  })

  win.once('ready-to-show', () => win.show())

  win.webContents.on('did-fail-load',
    (event, errorCode, errorDescription, url) => {
      // dereference window to prevent on close handler trying to terminate
      win = null

      _failApp(`Failed to load ${url}\nReason: ${errorDescription} (${errorCode})`, _parseQuery(url).state)
    }
  )

  win.webContents.on('will-navigate',
    (event, url) => handleCallback(url)
  )

  win.webContents.on('will-redirect',
    (event, url) => handleCallback(url)
  )

  win.webContents.on('did-get-redirect-request',
    (event, oldUrl, newUrl) => handleCallback(newUrl)
  )

  win.on('closed', () => {
    // only fail the application if the windows has not been
    // closed due to redirect URL received
    if (win) {
      _failApp('User terminated the browser without authenticating', _parseQuery(authUrl).state)
    }
  })

  // after registering event handler clear any storage and as a callback
  // after clearing, load the URL
  //
  // TODO: This is a small child's implementation of starting with a
  //       blank slate, ideally we'd be able to run a private browser
  //       window (aka incognito mode) ... but how, just how ?
  const launchAuth = () => win.loadURL(authUrl)
  if (force) {
    win.webContents.session.clearStorageData({}, launchAuth)
  } else {
    launchAuth()
  }
}

app.on('ready', createWindow)
