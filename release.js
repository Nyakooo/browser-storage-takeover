const fs = require('fs')
const semver = require('semver')
const pkg = require('./package.json')
const manifest = require('./packages/shell-chrome/manifest.json')

const curVersion = pkg.version

;(async () => {
  const { input, confirm } = await import('@inquirer/prompts')
  const newVersion = await input({
    message: `Please provide a version (current: ${curVersion}):`,
  })

  if (!semver.valid(newVersion)) {
    console.error(`Invalid version: ${newVersion}`)
    process.exit(1)
  }

  if (semver.lt(newVersion, curVersion)) {
    console.error(`New version (${newVersion}) cannot be lower than current version (${curVersion}).`)
    process.exit(1)
  }

  const yes = await confirm({ message: `Release ${newVersion}?` })

  if (yes) {
    pkg.version = newVersion
    manifest.version = newVersion
    fs.writeFileSync('./package.json', JSON.stringify(pkg, null, 2))
    fs.writeFileSync('./packages/shell-chrome/manifest.json', JSON.stringify(manifest, null, 2))
  } else {
    process.exit(1)
  }
})()
