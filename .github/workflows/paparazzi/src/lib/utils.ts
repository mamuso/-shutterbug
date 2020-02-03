/* eslint-disable no-console */

/**
 * Silly utilities, mostly for logging.
 */

export class Printer {
  header = (text: string): void => {
    console.log('')
    console.log(
      '-----------------------------------------------------------------------'
    )
    console.log(`${text}`)
    console.log(
      '-----------------------------------------------------------------------'
    )
  }

  subheader = (text: string): void => {
    console.log('')
    console.log(`${text}`)
    console.log(
      '-----------------------------------------------------------------------'
    )
  }

  capture = (text: string): void => {
    console.log(`  └ 🏙  ${text}`)
  }

  compare = (text: string): void => {
    console.log(`  └ 🎆  ${text}`)
  }
}
