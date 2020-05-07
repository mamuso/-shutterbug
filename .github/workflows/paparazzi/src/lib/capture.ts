/* eslint-disable no-console */

/**
 * Capture a list of urls with puppeteer.
 */

import {Config, Device, Page, Report, CaptureType} from './types'
import Printer from './utils'
import Store from './store'
import Compare from './compare'
import Compress from './compress'
import Notify from './notify'
import DB from './db'
import * as path from 'path'
import * as fs from 'fs'
import * as rp from 'request-promise'
import sharp from 'sharp'
import slugify from '@sindresorhus/slugify'
import puppeteer from 'puppeteer'

export default class Capture {
  browser
  compare
  compress
  config
  current
  db
  dbDevice
  dbReport
  notify
  printer
  store

  constructor(config: Config) {
    this.printer = new Printer()
    this.config = {...config} as Config
    this.compare = new Compare({...config})
    this.compress = new Compress({...config})
    this.store = new Store({...config})
    this.db = new DB({...config})
    this.notify = new Notify({...config})
  }

  /**
   *  TODO
   */
  getCurrent = async () => {
    const currentdb = await this.db.getCurrent()
    this.current = currentdb[0] ? currentdb[0] : null
  }

  /**
   *  TODO
   */
  setCurrent = async () => {
    this.dbReport = await this.db.createReport()
    await this.db.setCurrent(this.dbReport.id)
  }

  /**
   *  TODO
   */
  downloadCurrent = async () => {
    if (this.current && this.current.captures) {
      await this.current.captures.forEach(async capture => {
        const filepath = capture.url.split(this.current.slug)[1]
        const currentpath = `${this.config.tmpCurrentPath}${filepath}`

        this.printer.download(filepath)

        if (!fs.existsSync(path.dirname(currentpath))) {
          fs.mkdirSync(path.dirname(currentpath))
        }

        const res = await rp.get({
          uri: capture.url,
          encoding: null
        })

        await fs.promises.writeFile(currentpath, res, {
          encoding: null
        })
      })
    }
  }

  /**
   *  TODO
   */
  capture = async () => {
    try {
      this.printer.header(`📷 Capture URLs`)

      this.dbReport = await this.db.createReport()

      this.browser = await puppeteer.launch({
        headless: true,
        defaultViewport: null,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      })

      /** Looping through devices */
      let i = 0
      const iMax = this.config.devices.length
      for (; i < iMax; i++) {
        const device = await this.setDevice(this.config.devices[i])

        this.printer.subHeader(
          `🖥  ${device.id} (${device.viewport.width}x${device.viewport.height})`
        )

        /** Make device folder */
        if (!fs.existsSync(`${this.config.tmpDatePath}/${device.id}`)) {
          await fs.promises.mkdir(`${this.config.tmpDatePath}/${device.id}`)
        }

        /** DB device */
        this.dbDevice = await this.db.createDevice(device)

        /** Looping through URLs */
        let j = 0
        const jMax = this.config.pages.length
        for (; j < jMax; j++) {
          const page: Page = this.config.pages[j]
          const filename = `${slugify(page.id)}.${this.config.format}`
          const localfilepath = `${this.config.tmpDatePath}/${device.id}/${filename}`
          const capture = {} as CaptureType

          this.printer.capture(`Capturing ${page.id}`)

          const puppet = await this.browser.newPage()
          await puppet.emulate(device)

          /** Authenticating if needed */
          if (page.auth) {
            if (this.config.auth.cookie) {
              await puppet.setCookie({
                value: 'yes',
                domain: `${process.env.FLUX_DOMAIN}`,
                expires: Date.now() / 1000 + 100,
                name: 'logged_in'
              })
              await puppet.setCookie({
                value: `${process.env.FLUX_COOKIE}`,
                domain: `${process.env.FLUX_DOMAIN}`,
                expires: Date.now() / 1000 + 100,
                name: 'user_session'
              })
            } else {
              await puppet.goto(this.config.auth.url, {
                waitUntil: 'load'
              })
              // Login
              await puppet.type(
                this.config.auth.username,
                `${process.env.FLUX_LOGIN}`
              )
              await puppet.type(
                this.config.auth.password,
                `${process.env.FLUX_PASSWORD}`
              )
              await puppet.click(this.config.auth.submit)
            }
          }

          await puppet.goto(page.url, {
            waitUntil: 'networkidle0',
            timeout: 60000
          })

          await puppet._client.send('Animation.setPlaybackRate', {
            playbackRate: 2
          })

          // // Scrolling through the page to activate effects
          // await puppet.evaluate(_ => {
          //   let tHeight = 0
          //   const dist = 100
          //   let timer = setInterval(() => {
          //     const scrollHeight = document.body.scrollHeight
          //     window.scrollBy(0, dist)
          //     tHeight += dist
          //     if (tHeight >= scrollHeight) {
          //       clearInterval(timer)
          //       window.scrollTo(0, 0)
          //       return true
          //     }
          //   }, 150)
          // })
          // If the page is bigger than the viewport, then we screenshot clips or the image and stitch them together
          const scrollHeight = await puppet.evaluate(_ => {
            return document.body.scrollHeight
          })

          if (scrollHeight > device.viewport.height) {
            let s = 0
            let scrollTo = 0
            const safeSpace = 400
            // We leave a few pixels between snapshots to stich free of header duplications
            const scrollSafe = device.viewport.height - safeSpace
            while (scrollTo + scrollSafe < scrollHeight) {
              await puppet.evaluate(
                ({scrollTo}) => {
                  window.scrollTo(0, scrollTo)
                },
                {scrollTo}
              )
              await puppet.waitFor(1000)

              const buffer = await puppet.screenshot({
                fullPage: false
              })

              await fs.promises.writeFile(
                `${this.config.tmpDatePath}/${s}.png`,
                buffer,
                {
                  encoding: null
                }
              )
              // increase variables
              s += 1
              scrollTo += scrollSafe
            }

            let baseImage = await sharp(
              `${this.config.tmpDatePath}/1.png`
            ).resize(
              device.viewport.width * device.deviceScaleFactor,
              scrollHeight * device.deviceScaleFactor
            )

            baseImage = baseImage.composite([
              {
                input: `${this.config.tmpDatePath}/0.png`,
                top: 0,
                left: 0
              }
            ])
            baseImage = baseImage.composite([
              {
                input: `${this.config.tmpDatePath}/1.png`,
                top: 1200 * device.deviceScaleFactor,
                left: 0
              }
            ])

            baseImage = baseImage.composite([
              {
                input: `${this.config.tmpDatePath}/3.png`,
                top: 2400 * device.deviceScaleFactor,
                left: 0
              }
            ])

            baseImage.toFile(localfilepath)

            // for (i == 0; i < s; i++) {
            //   let image = sharp(`${this.config.tmpDatePath}/${i}.png`)
            //   if (i != 0) {
            //   }
            // }
          } else {
            await puppet.screenshot({
              path: localfilepath,
              fullPage: true
            })
          }

          await puppet.close()

          /** DB page */
          const dbpage = await this.db.createPage(page, this.dbReport)
          capture.page = dbpage.id

          /** Upload images */
          capture.url = await this.store.uploadfile(
            `${this.config.date}/${device.id}/${filename}`,
            localfilepath
          )

          /** Write capture in the DB */
          await this.db.createCapture(
            this.dbReport,
            this.dbDevice,
            dbpage,
            capture
          )
        }
      }
    } catch (e) {
      throw e
    }
  }

  /**
   *  TODO
   */
  resize = async () => {
    try {
      this.dbReport = await this.db.createReport()
      let i = 0
      const iMax = this.config.devices.length
      for (; i < iMax; i++) {
        /** DB device */
        this.dbDevice = await this.db.getDevice(this.config.devices[i])

        this.printer.subHeader(`🖥  ${this.dbDevice.slug}`)

        /** Looping through URLs */
        let j = 0
        const jMax = this.config.pages.length
        for (; j < jMax; j++) {
          const page: Page = this.config.pages[j]
          const filename = `${slugify(page.id)}.${this.config.format}`
          const localfilepath = `${this.config.tmpDatePath}/${this.dbDevice.slug}/${filename}`
          const filenamemin = `${slugify(page.id)}-min.jpg`
          const localfilepathmin = `${this.config.tmpDatePath}/${this.dbDevice.slug}/${filenamemin}`

          this.printer.resize(`Resizing ${page.id}`)

          const dbpage = await this.db.createPage(page, this.dbReport)
          const capture = await this.db.getCapture(
            this.dbReport,
            this.dbDevice,
            dbpage
          )

          /** Resize captured image */
          await sharp(localfilepath)
            .resize({
              width: 800,
              height: 600,
              position: sharp.position.top,
              withoutEnlargement: true
            })
            .toFile(localfilepathmin)

          capture.urlmin = await this.store.uploadfile(
            `${this.config.date}/${this.dbDevice.slug}/${filenamemin}`,
            localfilepathmin
          )

          /** Write capture in the DB */
          await this.db.createCapture(
            this.dbReport,
            this.dbDevice,
            dbpage,
            capture
          )
        }
      }
    } catch (e) {
      throw e
    }
  }

  /**
   *  TODO
   */
  compareReports = async () => {
    try {
      this.dbReport = await this.db.createReport()
      let i = 0
      const iMax = this.config.devices.length
      for (; i < iMax; i++) {
        /** DB device */
        this.dbDevice = await this.db.getDevice(this.config.devices[i])

        this.printer.subHeader(`🖥  ${this.dbDevice.slug}`)

        /** Looping through URLs */
        let j = 0
        const jMax = this.config.pages.length
        for (; j < jMax; j++) {
          const page: Page = this.config.pages[j]
          const filename = `${slugify(page.id)}.${this.config.format}`
          const localfilepath = `${this.config.tmpDatePath}/${this.dbDevice.slug}/${filename}`
          const currentfilepath = `${this.config.tmpCurrentPath}/${this.dbDevice.slug}/${filename}`
          const filenamediff = `${slugify(page.id)}-diff.${this.config.format}`
          const localfilepathdiff = `${this.config.tmpDatePath}/${this.dbDevice.slug}/${filenamediff}`
          let diff = null

          this.printer.compare(`${page.id}`)

          const dbpage = await this.db.createPage(page, this.dbReport)
          let capture = await this.db.getCapture(
            this.dbReport,
            this.dbDevice,
            dbpage
          )

          /** Compare */
          diff = await this.compare.compare(
            localfilepath,
            currentfilepath,
            localfilepathdiff
          )

          if (diff && diff !== 0) {
            capture.diff = true
            capture.diffindex = diff
          } else {
            capture.diff = false
          }

          if (diff && diff > 0) {
            capture.urldiff = await this.store.uploadfile(
              `${this.config.date}/${this.dbDevice.slug}/${filenamediff}`,
              localfilepathdiff
            )
          }

          /** Write capture in the DB */
          await this.db.createCapture(
            this.dbReport,
            this.dbDevice,
            dbpage,
            capture
          )
        }
      }
    } catch (e) {
      throw e
    }
  }

  /**
   *  TODO
   */
  setDevice = async (configdevice: Device) => {
    let device = (configdevice.device
      ? puppeteer.devices[configdevice.device]
      : configdevice) as Device
    device.userAgent = device.userAgent || (await this.browser.userAgent())
    device.id = configdevice.id
    device.deviceScaleFactor = device.viewport.deviceScaleFactor

    return device
  }

  /**
   *  TODO
   */
  close = async () => {
    /** Close browser session */
    if (this.browser) {
      await this.browser.close()
    }

    if (this.db.prisma) {
      /** Disconnect from the DB */
      await this.db.prisma.disconnect()
    }
  }
}
