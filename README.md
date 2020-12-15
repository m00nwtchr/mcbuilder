# mcbuilder
Command line modpack builder for Minecraft!

## NPM Install

[![NPM](https://nodei.co/npm/mcbuilder.png)](https://nodei.co/npm/mcbuilder/)

## Usage
```
$ mcbuilder --help
Usage: mcbuilder [options] [command]

Options:
  -V, --version        output the version number
  -h, --help           output usage information

Commands:
  init
  remove <url>
  add [options] <url>
  install [options]
  build [options]
  register [options]
  run [options]
```

## Other

### CurseForge mod
A userscript that replaces unnnessecarily long and indirect "Install" links on the curseforge page with direct `curseforge://` links, might take a bit for the replacement to happen after the page loads. Useful when used in conjunction with the URL handler (`mcbuilder register`), but should work with the Curse client as well. Fixes the URL handler not triggering if another mod is being installed at the moment.

[Download](https://raw.githubusercontent.com/lmarianski/mcbuilder/master/curseforge-mod.js)