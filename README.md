# mcbuilder
Command line modpack builder for Minecraft!

## NPM Install

[![NPM](https://nodei.co/npm/mcbuilder.png)](https://nodei.co/npm/mcbuilder/)

## Usage
```
$ mcbuilder --help
Usage: mcbuilder [options] [command]

Command line modpack builder for Minecraft!

Options:
  -V, --version        output the version number
  -h, --help           output usage information

Commands:
  init                 Initalize a new pack repository
  remove <url>         Remove a mod, url can be a curseforge project id
  add [options] <url>  Adds a mod, url can be a CF project id or a curseforge:// url
  install [options]    Downloads all the mods described in the manifest
  build [options]      Builds a pack in one of the popular pack formats (e.g Curse)
  register [options]   Registers a URL handler for curseforge:// urls, for integration with the website, needs admin permissions (LINUX ONLY ATM)
  run [options]        Launches the pack in the minecraft launcher
```

## Other

### CurseForge mod
A userscript that replaces unnnessecarily long and indirect "Install" links on the curseforge page with direct `curseforge://` links, might take a bit for the replacement to happen after the page loads. Useful when used in conjunction with the URL handler (`mcbuilder register`), but should work with the Curse client as well. Fixes the URL handler not triggering if another mod is being installed at the moment.

[Download](https://github.com/lmarianski/mcbuilder/raw/master/curseforge-mod.user.js)