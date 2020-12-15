#!/usr/bin/env node
import fs from "fs-extra";
import path from "path";
import child_process from "child_process";
import os, { userInfo } from "os";
import { parse as urlParse, UrlWithParsedQuery } from "url";

import lockfile, { lock } from "lockfile";
import sevenBin from "7zip-bin";
import Zip from "node-7z";
import axios from "axios";
import promptly from 'promptly';
import commander, { parse } from 'commander';
const program = new commander.Command();

import * as curse from "./utils/cursemeta";
import { downloadFile } from "./utils/downloader";
import { Manifest } from "./objects/Manifest";
import { CFFile } from "./objects/CFFile";
import { FileDepType, IFile, PackDepType } from "./objects/IFile";

const tmpFilePath = path.join(os.tmpdir(), 'last-mcbuilder-path');

const packageInfo = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json")).toString("utf8"));

function findManifest(directory?: string): string {
    if (directory === undefined) {
        directory = "."
    }

    const p = path.resolve(directory, "manifest.json");

    if (fs.existsSync(p)) {
        return p;
    } else if (fs.existsSync(tmpFilePath)) {
        const pa = fs.readFileSync(tmpFilePath).toString("utf8");
        if (fs.existsSync(path.join(pa, "manifest.json"))) {
            process.chdir(pa);
            return findManifest();
        }
    } else {
        return null;
    }
}

let manifest: Manifest;
const manifestPath = findManifest();

function saveManifest() {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest.toJSON(), null, "\t"))
}

function loadManifest() {
    return new Promise(async (resolve, reject) => {
        try {
            if (fs.existsSync(manifestPath)) {
                const str = fs.readFileSync(manifestPath).toString("utf8");

                manifest = await Manifest.fromJSON(str);

                //console.log(manifest)

                return resolve(manifest)
            }
            return reject();
        } catch (e) {
            console.error(e);
            return reject(e);
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

        manifest = Object.assign(new Manifest(pa.name, "1.16.4", "", ""), manifest);

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
            fs.writeFileSync(manifestPath, manifestFinal);

            saveLastPath();
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

        const p = path.join("mods", ref.getFileName());

        if (fs.existsSync(p))
            fs.unlinkSync(p);
    });

const add = async (ref: IFile, depType: PackDepType, all?: IFile[]): Promise<IFile[]> => {
    all = all || [];

    if (!manifest) process.exit(0);

    try {
        await ref.fetch();

        (ref as any).depType = depType;

        manifest.addDep(ref);
        all.push(ref);

        const promises: Promise<IFile[]>[] = [];

        (await ref.getDependencies(FileDepType.REQUIRED)).forEach(dep => {
            promises.push(add(dep, depType, all));
        });

        await Promise.all(promises);
    } catch (e) {
        console.error(e);
    }
    saveManifest();

    return all;
}

const parseUrl = (str: string, opts?: any): IFile => {
    let url: UrlWithParsedQuery;

    try {
        url = urlParse(str, true);
    } catch (e) { }

    switch ((url && url.protocol) || '') {
        case ("curseforge:"):
            if (url.host === "install") {
                const addonId = parseInt(url.query['addonId'] as string);
                const fileId = parseInt(url.query['fileId'] as string);

                return new CFFile(manifest, addonId, opts.urlFile ? fileId : undefined);
            } else {
                process.exit(0);
            }
        default:
            try {
                const addonId = parseInt(str);

                return new CFFile(manifest, addonId);
            } catch (e) {
                throw new Error(`Not a supported mod source URL: ${str}`)
            }
            break;
    }
}

program
    .command("add <url>")
    .option("-f, --file <fileId>", "If adding by CurseForge project id, use this to specify the file, otherwise latest for current game version is used")
    .option("--urlFile", "If used to handle an url, this tells the program to extract the file id from the url rather than try to look for it itself (NOT RECCOMENDED")
    .option("-C, --client", "If specified, the file will be added as a client-only dependency.")
    .option("-S, --server", "If specified, the file will be added as a server-only dependency.")
    .action(async (url: string, options) => {
        const ref = parseUrl(url, { urlFile: options.urlFile });

        if (ref instanceof CFFile) {
            ref.fileId = options.file ? parseInt(options.file) : undefined;
        }

        const all = await add(ref, options.client ? PackDepType.CLIENT : options.server ? PackDepType.SERVER : PackDepType.COMMON);

        await Promise.all(all.map(async ref => {
            return await install(ref);
        }));

        cleanup();
    });

const install = async (ref: IFile) => {
    const filePath = path.join("mods", ref.getFileName())

    if (!fs.existsSync(filePath)) {
        await ref.fetch();
        await downloadFile(filePath, await ref.getDownloadUrl(), percent => {
            console.log(`Downloading ${ref.getFileName()}. ${percent}% Done`);
        });
    }
}

program
    .command("install")
    .option("-U, --update", "If specified, the program will look for updates for all the mods it knows sources of.")
    .action(async (options) => {
        const updated: IFile[] = [];

        await Promise.all(manifest.dependencies.map(el => {
            return new Promise(async (resolve, reject) => {
                let p = path.join("mods", el.getFileName());

                if (options.update) {
                    await el.fetch();
                    if (el.canUpdate()) {
                        if (fs.existsSync(p))
                            fs.unlinkSync(p);
                        el = await el.getUpdateRef();
                        p = path.join("mods", el.getFileName());
                        updated.push(el);
                        //console.dir((await el.getUpdateRef()).getFileName());
                    }
                }

                install(el);

                return resolve();
            });
        }));

        updated.forEach(el => {
            manifest.addDep(el);
        });

        //console.dir((manifest.dependencies[0] as CFRef).projectInfo.gameVersionLatestFiles)
        cleanup();
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

                const overridesPath = path.join("build", "overrides");
                const overridesMods = path.join(overridesPath, "mods");

                fs.ensureDirSync(overridesPath);
                
                manifest.dependencies.forEach(val => {
                    if (!(val instanceof CFFile)) {
                        fs.ensureDirSync(overridesMods);
                        fs.copyFileSync(path.join("mods", val.getFileName()), path.join(overridesMods, val.getFileName()));
                    }
                })

                fs.copySync("overrides", overridesPath, { recursive: true });

                process.chdir("build");
                const z = (Zip as any).add(path.join("..", "out", `${manifest.name}.zip`), path.join("**"), {
                    $bin: sevenBin.path7za,
                    recursive: true,
                })
                z.on("end", () => {
                    process.chdir("..");
                    fs.removeSync("build");
                })

                break;
            case ("raw"):
                break;
        }

        cleanup();
    })
program
    .command("register")
    .option("--urlFile", "When the handler tries to add a mod, the --urlFile option is passed to mcbuilder add (NOT RECOMMENDED, if you use this make sure to always select the specific file you want to download on Curse, because it may give you the wrong MC version otherwise)")
    .option("-D, --unregister", "Removes the CurseForge URL handler")
    // .option("-s, --system", "Register the URL handler system-wide (needs admin perms)")
    .action((options) => {
        options.system = true;
        switch (process.platform) {
            case ("linux"):
                const filePath = path.join(...(options.system ? ["/", "usr"] : [process.env.HOME, ".local"]), "share", "applications", "mcbuilder.desktop");

                if (process.getuid() !== 0 && options.system) {
                    // console.log(`sudo ${process.argv.join(" ")}`)
                    // child_process.execSync(`sudo ${process.argv.join(" ")}`);
                    child_process.spawnSync('sudo', process.argv, {
                        stdio: 'inherit'
                    });
                    process.exit(0);
                }

                const fileContent = `[Desktop Entry]
                Encoding=UTF-8
                Type=Application
                Terminal=true
                Exec=${process.argv[1]} add${options.urlFile ? " --urlFile" : ''} %u
                Name=mcbuilder
                Comment=MC Modpack builder (URL Handler for CurseForge)
                Icon=
                Categories=Application;
                MimeType=x-scheme-handler/curseforge;`;

                if (!options.unregister) {
                    fs.writeFileSync(filePath, fileContent);
                } else {
                    fs.unlinkSync(filePath);
                }

                child_process.spawnSync('update-desktop-database', [path.dirname(filePath)])

                break;
        }

        cleanup();
    })

const wait = (ms: number) => {
    return new Promise((resolve, reject) => {
        try {
            setTimeout(() => {
                return resolve();
            }, ms);
        } catch(e) {
            return reject(e);
        }
    });
}

const mcLauncherTmpPath = path.join(os.tmpdir(), "mcbuilder-mc-launcher-tmp");

program
    .command("run")
    .option("-w, --workDir <dir>", "Work dir for the mc launcher, a temporary directory is used otherwise")
    .action(async (options) => {
        const mcWorkDir = options.workDir || mcLauncherTmpPath;

        fs.ensureDirSync(mcWorkDir);

        const launcherProfilesJsonPath = path.join(mcWorkDir, "launcher_profiles.json")

        if (!fs.existsSync(launcherProfilesJsonPath)) {
            let mcProc;
            mcProc = child_process.spawn('minecraft-launcher', ['--workDir', mcWorkDir]);
        
            await wait(3000);

            mcProc.kill();
        }

        const forgeVersionName = `${manifest.gameVersion}-forge-${manifest.forgeVersion}`;

        if (!fs.existsSync(path.join(mcWorkDir, "versions", forgeVersionName))) {
            const forgeInstllerName = `forge-${manifest.gameVersion}-${manifest.forgeVersion}-installer.jar`;
            const forgeInstallerPath = path.join(mcWorkDir, forgeInstllerName);

            const forgeInstallerURL = `http://files.minecraftforge.net/maven/net/minecraftforge/forge/${manifest.gameVersion}-${manifest.forgeVersion}/${forgeInstllerName}`

            if (!fs.existsSync(forgeInstallerURL))
                await downloadFile(forgeInstallerPath, forgeInstallerURL, percent => {
                    console.log(`Downloading ${forgeInstllerName}. ${percent}% Done`);
                });

            console.log(`Install forge client to "${mcWorkDir}"`);

            child_process.spawnSync('java', ['-jar', forgeInstallerPath]);
        }

        const launcherProfiles = JSON.parse(fs.readFileSync(launcherProfilesJsonPath).toString("utf8"));

        launcherProfiles.profiles['mcbuilder'] = {
            name: manifest.name,
            type: 'custom',
            lastVersionId: forgeVersionName,
            gameDir: path.resolve("run")
        };

        fs.writeFileSync(launcherProfilesJsonPath, JSON.stringify(launcherProfiles, null, 2))

        {
            let mcProc;
            mcProc = child_process.spawn('minecraft-launcher', ['--workDir', mcWorkDir]);
        }

        cleanup();
    })

function cleanExit(code: number, err?: Error) {
    cleanup();

    // console.error(err);
    process.exit(code);
}

function cleanup() {
    if (lockfile.checkSync("repo.lock"))
        lockfile.unlockSync("pack.lock");
}

function saveLastPath() {
    if (process.getuid() !== 0)
        fs.writeFileSync(tmpFilePath, process.cwd())
}

program.exitOverride(err => cleanExit(1, err))

if (process.argv.length <= 2) {
    process.argv.push("--help");
}

if (lockfile.checkSync("pack.lock")) {
    console.log("Waiting for other mcbuilder process to quit... Delete pack.lock if you're sure this is an error")
}
lockfile.lock("pack.lock", { wait: Number.MAX_VALUE }, (err) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }

    loadManifest().then(() => {
        fs.ensureDirSync("mods");
        fs.ensureDirSync("run");
        fs.ensureSymlinkSync("mods", path.join("run", "mods"));

        fs.ensureDirSync("overrides");
        fs.ensureDirSync(path.join("overrides", "config"))
        fs.ensureSymlinkSync(path.join("overrides", "config"), path.join("run", "config"));


        saveLastPath();

        program.parse(process.argv);
        // checkFS();
        saveManifest();

        // cleanup();
    }).catch((err) => {
        // console.error("Manifest not found.");
        // if (err) console.debug(err);
        program.parse(process.argv);
    });
});