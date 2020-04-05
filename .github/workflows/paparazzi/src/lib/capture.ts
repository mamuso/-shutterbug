/* eslint-disable no-console */

/**
 * Capture a list of urls with puppeteer.
 */

import {Config, Device} from './types'
import Printer from './utils'
import * as fs from 'fs'
import slugify from '@sindresorhus/slugify'
import puppeteer from 'puppeteer'

export default class Capture {
  printer = new Printer()
  config = {} as Config

  constructor(config: Config) {
    this.config = {...config}
  }

  capture = async (): Promise<boolean> => {
    this.printer.header(`📷 Capture URLs`)

    /** Looping through devices */
    let i = 0
    const iMax = this.config.devices.length
    for (; i < iMax; i++) {
      const captureDevice = this.config.devices[i]
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      })
      const page = await browser.newPage()
      let device = (captureDevice.device
        ? puppeteer.devices[captureDevice.device]
        : captureDevice) as Device
      device.userAgent = device.userAgent || (await browser.userAgent())

      this.printer.subheader(
        `🖥  ${device.id} (${device.viewport.width}x${device.viewport.height})`
      )

      await page.emulate(device)

      /** Make device folder */
      if (!fs.existsSync(`${this.config.tmpDatePath}/${device.id}`)) {
        await fs.promises.mkdir(`${this.config.tmpDatePath}/${device.id}`)
      }

      /** Looping through URLs */
      let j = 0
      const jMax = this.config.urls.length
      for (; j < jMax; j++) {
        const captureData = this.config.urls[j]
        const fileName = `${slugify(captureData.id)}.${this.config.format}`
        const localFilePath = `${this.config.tmpDatePath}/${device.id}/${fileName}`

        this.printer.capture(captureData.id)

        await page.goto(captureData.url)
        await page.screenshot({
          path: localFilePath,
          fullPage: captureData.fullPage
        })
      }

      await browser.close()
    }
    return true
  }
}
