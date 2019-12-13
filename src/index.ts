#!/usr/bin/env node
import fs from "fs-extra";
import path from "path";
import os from "os";

import sevenBin from "7zip-bin";
import Zip from "node-7z";
import axios from "axios";
import promptly from 'promptly';
import commander from 'commander';
const program = new commander.Command();

import * as curse from "./utils/cursemeta";
import { downloadFile } from "./utils/downloader";
import { Manifest } from "./objects/Manifest";
import { CFFile } from "./objects/CFFile";
import { IFile, DepType } from "./objects/IFile";


const packageInfo = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json")).toString("utf8"));

function findManifest(directory?: string) {
    if (directory === undefined) {
        directory = "."
    }

    return path.resolve("manifest.json");
}

let manifest: Manifest;
let manifestPath: string;

function saveManifest() {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest.toJSON(), null, "\t"))
}

function loadManifest() {
    return new Promise(async (resolve, reject) => {
        try {
            manifestPath = findManifest();

            if (fs.existsSync(manifestPath)) {
                const mn = fs.readFileSync(manifestPath).toString("utf8");

                manifest = await Manifest.fromJSON(JSON.parse(mn));

                //console.log(manifest)

                resolve(manifest)
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
                //console.log(el)
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
        try {
            const raw = await axios.get("https://files.minecraftforge.net/maven/net/minecraftforge/forge/promotions_slim.json");
            const data = raw.data
            manifest.forgeVersion = data.promos[`${manifest.gameVersion}-latest`];
        } catch (e) {
            console.debug(e);
        }
        manifest.forgeVersion = await promptly.prompt(`Enter forge version [${manifest.forgeVersion}]:`, {
            default: manifest.forgeVersion
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
        //console.log(url)
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
    .option("-C, --client", "If specified, the file will be added as a client-only dependency.")
    .option("-S, --server", "If specified, the file will be added as a server-only dependency.")
    .action(async (url: string, options) => {
        const ref = await CFFile.create(manifest, parseInt(url), options.file ? parseInt(options.file) : undefined);

        ref.depType = options.client ? DepType.CLIENT : options.server ? DepType.SERVER : DepType.COMMON;

        manifest.addDep(ref);
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
            manifest.addDep(el);
        });

        //console.dir((manifest.dependencies[0] as CFRef).projectInfo.gameVersionLatestFiles)
    });
program
    .command("build")
    .option("-f, --format [format]", `select the export format, default is CurseForge (Twitch) format
    Formats:
    cf  - CurseForge (Twitch)
    raw - Raw minecraft profile`, "cf")
    .action((options) => {
        switch (options.format) {
            case ("cf"):
                const cfManifest = {
                    minecraft: {
                        version: manifest.gameVersion,
                        modLoaders: [
                            {
                                id: `forge-${manifest.forgeVersion}`,
                                primary: true
                            }
                        ]
                    },
                    manifestType: "minecraftModpack",
                    manifestVersion: 1,
                    name: manifest.name,
                    files: [...manifest.dependencies]
                        .filter(el => el instanceof CFFile)
                        //.map(el => el.toJSON())
                        .map((el: CFFile) => {
                            return {
                                projectID: el.projectId,
                                fileID: el.fileId,
                                required: true
                            }
                        }),

                }

                if (fs.existsSync("build")) fs.rmdirSync("build", { recursive: true });
                if (fs.existsSync("out")) fs.rmdirSync("out", { recursive: true });

                fs.mkdirSync("build");
                fs.mkdirSync("out");

                fs.writeFileSync(path.join("build", "manifest.json"), JSON.stringify(cfManifest, null, "\t"));

                if (fs.existsSync("overrides")) fs.copySync("overrides", path.join("build", "overrides"), { recursive: true });

                process.chdir("build");
                (Zip as any).add(path.join("..", "out", `${manifest.name}.zip`), path.join("**"), {
                    $bin: sevenBin.path7za,
                    recursive: true,
                })
                process.chdir("..");

                break;
            case ("raw"):
                break;
        }
    })

loadManifest().then(() => {
    program.parse(process.argv);
    checkFS();
    saveManifest();
}).catch((e) => {
    console.error("Manifest not found.");
    console.debug(e);
    program.parse(process.argv)
})
