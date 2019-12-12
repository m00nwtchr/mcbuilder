#!/usr/bin/env node
import fs from "fs";
import path from "path";

import axios from "axios";
import promptly from 'promptly';
import commander from 'commander';
const program = new commander.Command();

import * as curse from "./utils/cursemeta";
import { downloadFile } from "./utils/downloader";
import { Manifest } from "./objects/Manifest";
import { CFFile } from "./objects/CFFile";
import { IFile } from "./objects/IFile";

const packageInfo = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json")).toString("utf8"));

function findManifest(directory?: string) {
    if (directory === undefined) {
        directory = "."
    }

    return path.resolve("manifest.json");
}

export let manifest: Manifest;
let manifestPath: string;

function saveManifest() {
    let mn = { ...manifest };

    mn = Object.assign(new Manifest("", "", "", ""), mn);

    mn.dependencies.map(el => el.toJSON());

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, "\t"))
}

function addDep(dep: IFile) {
    if (dep instanceof CFFile) {
        console.log(dep)
        let ls = manifest.dependencies.filter(el => el.equals(dep));
        if (ls.length > 0) {
            manifest.dependencies = manifest.dependencies.filter(el => !ls.includes(el));
        } else {
        }
        manifest.dependencies.push(dep);
    }
    //process.exit(0);
}

function loadManifest() {
    return new Promise(async (resolve, reject) => {
        try {
            manifestPath = findManifest();

            if (fs.existsSync(manifestPath)) {
                let mn = fs.readFileSync(manifestPath).toString("utf8");
                manifest = JSON.parse(mn);


                await Promise.all(manifest.dependencies.map((el: any) => {
                    if (typeof el.projectId === 'number') {
                        return CFFile.fromJSON(el);
                    }
                })).then(deps => {
                    manifest.dependencies = deps;

                    addDep(deps[0]);
                    resolve();
                });
            } else {
                reject();
            }
        } catch (e) {
            reject(e)
            console.error(e)
        }
    });

}

function checkFS() {
    if (fs.existsSync("mods")) {
        const fsFiles = fs.readdirSync("mods");
        const mnFiles = manifest.dependencies.map(el => el.getFileName());

        fsFiles.forEach(el => {
            if (!mnFiles.includes(el)) {
                console.log(el)
                fs.unlinkSync(path.join("mods", el));
            }
        })
    }
}

program
    .name(packageInfo.name)
    .version(packageInfo.version);

program
    .command("init")
    .action(async () => {
        const pa = path.parse(path.parse(manifestPath).dir);

        manifest = Object.assign(new Manifest(pa.name, "1.12.2", "", ""), manifest);

        manifest.name = await promptly.prompt(`Enter name [${manifest.name}]:`, {
            default: manifest.name
        });
        manifest.gameVersion = await promptly.prompt(`Enter game version [${manifest.gameVersion}]:`, {
            default: manifest.gameVersion
        });
        manifest.description = await promptly.prompt(`Enter description${manifest.description != "" ? ` [${manifest.description}]` : ""}:`, {
            default: manifest.description
        });

        manifest.author = await promptly.prompt(`Enter author(s)${manifest.author != "" ? ` [${manifest.author}]` : ""}:`, {
            default: manifest.author
        });

        const manifestFinal = JSON.stringify(manifest, null, "\t");
        console.log(manifestFinal)

        if (await promptly.confirm("Is this correct?")) {
            fs.writeFileSync(manifestPath, manifestFinal)
        }
    });
program
    .command("remove <url>")
    .action(async (url: string) => {

        let ref: IFile = null;
        const ne: IFile[] = [];
        console.log(url)
        manifest.dependencies.forEach(el => {
            if (el instanceof CFFile && el.projectId === parseInt(url)) {
                ref = el;
            } else {
                ne.push(el);
            }
        });
        manifest.dependencies = ne;

        saveManifest();

        if (!fs.existsSync("mods")) fs.mkdirSync("mods");

        const p = path.join("mods", ref.getFileName());
        
        if (fs.existsSync(p))
            fs.unlinkSync(p);
    });
program
    .command("add <url>")
    .option("-f, --file <fileId>", "If adding by CurseForge project id, use this to specify the file, otherwise latest for current game version is used")
    .action(async (url: string, options) => {
        const ref = await CFFile.create(parseInt(url), options.file ? parseInt(options.file) : undefined);

        addDep(ref);
        //console.log(ref)
        saveManifest();

        if (!fs.existsSync("mods")) fs.mkdirSync("mods");

        downloadFile(path.join("mods", ref.getFileName()), await ref.getDownloadUrl(), percent => {
            console.log(`Downloading ${ref.getFileName()}. ${percent}% Done`);
        });
    });

program
    .command("install")
    .option("-U, --update", "If specified, the program will look for updates for all the mods it knows sources of.")
    .option("-C, --client", "If specified, the file will be added as a client-only dependency.")
    .option("-S, --server", "If specified, the file will be added as a server-only dependency.")
    .action(async (options) => {
        if (!fs.existsSync("mods")) fs.mkdirSync("mods");

        const updated: IFile[] = [];

        const promises: Promise<void>[] = [];

        manifest.dependencies.forEach(el => {
            promises.push(new Promise(async (resolve, reject) => {
                let p = path.join("mods", el.getFileName());

                if (options.update) {
                    if (el.canUpdate()) {
                        if (fs.existsSync(p))
                            fs.unlinkSync(p);
                        el = await el.getUpdateRef();
                        p = path.join("mods", el.getFileName());
                        updated.push(el);
                        //console.dir((await el.getUpdateRef()).getFileName());
                    }
                }
    
                if (!fs.existsSync(p)) {
                    downloadFile(p, await el.getDownloadUrl(), percent => {
                        console.log(`Downloading ${el.getFileName()}. ${percent}% Done`);
                        resolve();
                    });
                }
            }));
        });

        await Promise.all(promises);

        updated.forEach(el => {
            addDep(el);
        });

        //console.dir((manifest.dependencies[0] as CFRef).projectInfo.gameVersionLatestFiles)
    });

loadManifest().then(() => {
    program.parse(process.argv);
    checkFS();
    saveManifest();
}).catch((e) => {
    console.error("Manifest not found.");
    //console.debug(e);
    program.parse(process.argv)
})
