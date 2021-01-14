#!/usr/bin/env node
import fs from "fs-extra";
import path from "path";
import child_process from "child_process";
import os, { type, userInfo } from "os";
import { parse as urlParse, UrlWithParsedQuery } from "url";

import cheerio from "cheerio";
import lockfile, { lock } from "lockfile";
import sevenBin from "7zip-bin";
import z from "node-7z";
const Zip = zipPromise(z);
import axios from "axios";
import promptly from 'promptly';
import commander, { parse } from 'commander';
const program = new commander.Command();

import * as curse from "./utils/cursemeta";
import { downloadFile } from "./utils/downloader";
import { convertCfPackManifest, Manifest } from "./objects/Manifest";
import { CFFile } from "./objects/CFFile";
import { FileDepType, IFile, PackDepType } from "./objects/IFile";

const packageInfo = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json")).toString("utf8"));

const appData = process.env[process.platform === 'win32' ? 'APPDATA' : (process.platform === 'linux' ? 'XDG_CONFIG_HOME' : '')] || (process.platform === 'linux' && os.homedir() + "/.config") || (process.platform === "darwin" && os.homedir() + "/Library/Application Support");
const userData = path.join(appData, packageInfo.name);

const userSettingsPath = path.join(userData, 'settings.json');

const defaultUserSettings: { lastPath?: string, instanceDir?: string } = {
    lastPath: '',
    instanceDir: path.join(userData, 'instances')
};

let userSettings: typeof defaultUserSettings = {};

function findManifest(directory?: string): string {
    if (directory === undefined) {
        directory = "."
    }

    const p = path.resolve(directory, "manifest.json");
    const pa = userSettings.lastPath && path.join(userSettings.lastPath, "manifest.json");

    if (fs.existsSync(p)) {
        return p;
    } else if (fs.existsSync(pa)) {
        process.chdir(path.dirname(pa));
        return findManifest();
    } else {
        return null;
    }
}

let manifest: Manifest;
let manifestPath: string;

function loadSettings() {
    if (fs.existsSync(userSettingsPath)) {
        userSettings = JSON.parse(fs.readFileSync(userSettingsPath).toString("utf8"));
    } else {
        userSettings = Object.assign({}, defaultUserSettings);
    }
    return userSettings;
}

function saveSettings() {
    userSettings.lastPath = process.cwd();

    fs.ensureDirSync(userData)

    fs.writeFileSync(userSettingsPath, JSON.stringify(Object.assign({}, defaultUserSettings, userSettings), null, "\t"));
}

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
    .description(packageInfo.description)
    .version(packageInfo.version);

const gitignore = `mods

run
out
.lock

*.jar`;

program
    .command("init")
    .description("Initalize a new pack repository")
    .action(async () => {
        const pa = path.parse(path.dirname(manifestPath));

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

            if (!fs.existsSync('.gitignore'))
                fs.writeFileSync('.gitignore', gitignore);

            saveSettings();
        }
    });

/**
 * Convert slug to project id
 * @deprecated Doesn't work because of cloudflare
 */
const slugToId = async (slug: string): Promise<number> => {
    const URL = `https://www.curseforge.com/minecraft/mc-mods/${slug}`;

    const resp = await axios.get(URL);
    const $ = cheerio.load(resp.data.toString());

    const el = $('body > div.flex.flex-col.min-h-full.min-h-screen > main > div.z-0 > div.mx-auto.container.pb-5 > section > aside > div > div > div:nth-child(1) > div.flex.flex-col.mb-3 > div:nth-child(1) > span:nth-child(2)');

    return parseInt(el.text());
}

const parseUrl = async (str: string | number, opts?: any): Promise<IFile> => {
    let url: UrlWithParsedQuery;

    try {
        if (typeof str === 'string')
            url = urlParse(str, true);
    } catch (e) { }

    switch ((url && url.protocol) || '') {
        case ("curseforge:"): {
            const addonId = parseInt(url.query['addonId'] as string);
            const fileId = parseInt(url.query['fileId'] as string);

            return new CFFile(manifest, addonId, opts.urlFile ? fileId : undefined);
        }
        // case ("http:"):
        // case ("https:"):
        // if (url.host.match(/.*curseforge.*/)) {
        //     const spl = url.path.split("/");
        //     const slug = spl[spl.length - 1];

        //     return await parseUrl(await slugToId(slug), opts);
        // }
        // break;
        default: {
            const addonId = typeof str === 'string' ? parseInt(str) : str;

            if (addonId === NaN) {
                throw new Error(`Not a supported mod source URL: ${str}`)
            }

            return new CFFile(manifest, addonId);
        }
    }
}

function zipPromise(zip: typeof z): typeof z {
    const newZip: typeof z = {

    };

    Object.keys(zip).forEach((key) => {
        const el = (zip as any)[key];

        if (el instanceof Function) {
            (newZip as any)[key] = function () {
                const arg = Array.from(arguments);
                return new Promise<void>((resolve, reject) => {
                    const z = (el as Function).call(zip, ...arg);
                    z.on("end", () => {
                        // console.dir(el.toString())
                        // console.dir(z, {depth:3})
                        resolve();
                    })
                    z.on("error", (err:any)=>reject(err));
                })
            }
        }
    });

    return newZip;
}

program
    .command("remove <url>")
    .description("Remove a mod, url can be a curseforge project id")
    .action(async (url: string) => {

        const removeRef: IFile = await parseUrl(url);

        manifest.dependencies = manifest.dependencies.filter(el => !el.equals(removeRef));
        saveManifest();

        const p = path.join("mods", removeRef.getFileName());

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

const installModpack = async (ref: IFile) => {
    if (lockfile.checkSync("pack.lock"))
        lockfile.unlockSync("pack.lock");

    const filePath = path.join(userData, "cache", ref.getFileName())

    fs.ensureDirSync(path.dirname(filePath));

    if (!fs.existsSync(filePath)) {
        await ref.fetch();
        await downloadFile(filePath, await ref.getDownloadUrl(), percent => {
            console.log(`Downloading ${ref.getFileName()}. ${percent}% Done`);
        });
    }

    if (ref instanceof CFFile) {
        const tmpDir = fs.mkdtempSync(os.tmpdir()+"/");
        // console.dir(Zip)
        await (Zip as any).extractFull(filePath, tmpDir, {
            $bin: sevenBin.path7za,
            // recursive: true,
        });

        const packManifest = JSON.parse(fs.readFileSync(path.join(tmpDir, "manifest.json")).toString("utf8"));

        manifest = convertCfPackManifest(packManifest);

        const cwd = process.cwd();
        const p = path.join(userSettings.instanceDir, manifest.name);
        fs.ensureDirSync(p);
        process.chdir(p);

        fs.ensureFileSync("manifest.json");
        manifestPath = findManifest();

        saveManifest();
        saveSettings();

        const runDir = path.join("run");
        if (packManifest.overrides) {
            const pa = path.join("overrides");

            fs.ensureDirSync(pa);
            fs.ensureDirSync(runDir);

            fs.moveSync(path.join(tmpDir, packManifest.overrides), pa, {
                overwrite: true
            })

            const list = fs.readdirSync(pa);
            list.filter(el => el !== "mods").forEach(el => {
                fs.ensureSymlinkSync(path.join(pa, el), path.join(runDir, path.parse(el).name))
            });
        }

        fs.ensureDirSync("mods")
        fs.ensureSymlinkSync("mods", path.join(runDir, "mods"));

        await installAll();

        saveManifest();
        // saveSettings();

        // console.log(tmpDir)

        // process.chdir(cwd);
        fs.removeSync(tmpDir);
    }
}

program
    .command("add <url>")
    .description("Adds a mod, url can be a CF project id or a curseforge:// url")
    .option("-f, --file <fileId>", "If adding by CurseForge project id, use this to specify the file, otherwise latest for current game version is used")
    // .option("--urlFile", "If used to handle an url, this tells the program to extract the file id from the url rather than try to look for it itself (NOT RECCOMENDED")
    .option("-C, --client", "If specified, the file will be added as a client-only dependency.")
    .option("-S, --server", "If specified, the file will be added as a server-only dependency.")
    .action(async (url: string, options) => {
        const ref = await parseUrl(url, { urlFile: options.urlFile });

        if (ref instanceof CFFile) {
            ref.fileId = options.file ? parseInt(options.file) : undefined;
        }

        console.log("ADD")

        await ref.fetch();

        if (!ref.isModpack()) {
            const all = await add(ref, options.client ? PackDepType.CLIENT : options.server ? PackDepType.SERVER : PackDepType.COMMON);

            await Promise.all(all.map(async ref => {
                return await install(ref);
            }));
        } else {
            console.log("modpac")
            await installModpack(ref);
        }

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

const installAll = async (options: {update?: any} = {}) => {
    const updated: IFile[] = [];

    await Promise.all(manifest.dependencies.map(el => {
        return new Promise<void>(async (resolve, reject) => {
            if (!el.getFileName()) {
                await el.fetch();
            }

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

            await install(el);

            return resolve();
        });
    }));

    return updated;
}

program
    .command("install")
    .description("Downloads all the mods described in the manifest")
    .option("-U, --update", "If specified, the program will look for updates for all the mods it knows sources of.")
    .action(async (options) => {

        const updated = await installAll(options);

        updated.forEach(el => {
            manifest.addDep(el);
        });

        //console.dir((manifest.dependencies[0] as CFRef).projectInfo.gameVersionLatestFiles)
        cleanup();
    });
program
    .command("build")
    .description("Builds a pack in one of the popular pack formats (e.g Curse)")
    .option("-f, --format [format]", `select the export format, default is CurseForge (Twitch) format
    Formats:
    cf  - CurseForge`, "cf")
    .action(async (options) => {
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
                    overrides: "overrides"
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

                await (Zip as any).add(path.join("..", "out", `${manifest.name}.zip`), path.join("**"), {
                    $bin: sevenBin.path7za,
                    recursive: true,
                });

                process.chdir("..");
                fs.removeSync("build");

                // const z = (Zip as any).add(path.join("..", "out", `${manifest.name}.zip`), path.join("**"), {
                //     $bin: sevenBin.path7za,
                //     recursive: true,
                // });
                // z.on("end", () => {
                //     process.chdir("..");
                //     fs.removeSync("build");
                // })

                break;
            case ("raw"):
                break;
        }

        cleanup();
    })
program
    .command("register")
    .description("Registers a URL handler for curseforge:// urls, for integration with the website, needs admin permissions (LINUX ONLY ATM)")
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
    return new Promise<void>((resolve, reject) => {
        try {
            setTimeout(() => {
                return resolve();
            }, ms);
        } catch (e) {
            return reject(e);
        }
    });
}

program
    .command("run")
    .description("Launches the pack in the minecraft launcher")
    .option("-B, --bin <path>", "Path to the minecraft launcher binary")
    .option("-w, --workDir <dir>", "Work dir for the mc launcher, a temporary directory is used otherwise")
    .action(async (options) => {
        const mcWorkDir = options.workDir || path.join(userData, "launcher");
        const launcherBin = 'minecraft-launcher' || options.bin;

        fs.ensureDirSync(mcWorkDir);

        const launcherProfilesJsonPath = path.join(mcWorkDir, "launcher_profiles.json")
        const gameVersionsPath = path.join(mcWorkDir, "versions");

        if (!fs.existsSync(launcherProfilesJsonPath)) {
            let mcProc;
            mcProc = child_process.spawn(launcherBin, ['--workDir', mcWorkDir]);

            await wait(3000);

            mcProc.kill();
        }

        let forgeVersionName = `${manifest.gameVersion}-forge-${manifest.forgeVersion}`;
        const forgeVersionNameAlt = `${manifest.gameVersion}-forge${manifest.gameVersion}-${manifest.forgeVersion}`;

        if (!fs.existsSync(path.join(gameVersionsPath, forgeVersionName)) && !fs.existsSync(path.join(gameVersionsPath, forgeVersionNameAlt))) {
            const forgeInstllerName = `forge-${manifest.gameVersion}-${manifest.forgeVersion}-installer.jar`;
            const forgeInstallerPath = path.join(mcWorkDir, forgeInstllerName);

            const forgeInstallerURL = `http://files.minecraftforge.net/maven/net/minecraftforge/forge/${manifest.gameVersion}-${manifest.forgeVersion}/${forgeInstllerName}`

            if (!fs.existsSync(forgeInstallerPath))
                await downloadFile(forgeInstallerPath, forgeInstallerURL, percent => {
                    console.log(`Downloading ${forgeInstllerName}. ${percent}% Done`);
                });

            console.log(`Install forge client to "${mcWorkDir}"`);

            child_process.spawnSync('java', ['-jar', forgeInstallerPath]);
        }

        const launcherProfiles = JSON.parse(fs.readFileSync(launcherProfilesJsonPath).toString("utf8"));

        if (!launcherProfiles.profiles || !launcherProfiles.profiles["mcbuilder"])
            launcherProfiles.profiles = {};

        if (!fs.existsSync(path.join(gameVersionsPath, forgeVersionName))) {
            forgeVersionName = forgeVersionNameAlt;
        }

        launcherProfiles.profiles['mcbuilder'] = Object.assign({}, launcherProfiles.profiles['mcbuilder'], {
            name: manifest.name,
            type: 'custom',
            lastVersionId: forgeVersionName,
            gameDir: path.resolve("run")
        });

        fs.writeFileSync(launcherProfilesJsonPath, JSON.stringify(launcherProfiles, null, 2))

        {
            let mcProc;
            mcProc = child_process.spawn(launcherBin, ['--workDir', mcWorkDir], {
                stdio: "inherit"
            });
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
    saveSettings();
}

program.exitOverride(err => cleanExit(1, err))

if (process.argv.length <= 2) {
    process.argv.push("--help");
}

if (lockfile.checkSync("pack.lock")) {
    console.log("Waiting for other mcbuilder process to quit... Delete pack.lock if you're sure this is an error")
}
loadSettings();

manifestPath = findManifest();

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

        saveSettings();

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