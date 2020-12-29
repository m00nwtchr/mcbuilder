// @flow

import axios from 'axios';
//import log from 'electron-log';
const CURSEMETA_API_URL = `https://addons-ecs.forgesvc.net/api/v2`;

const log = console;

const doubleMap = (o: any) => {
    Object.keys(o).forEach(k => {
        const v = o[k];
        o[v] = k;
    })
    return o;
}

export const CATEGORY_ID = doubleMap({
    mods: 8,
    modpacks: 4471
});

export const sortByDate = (a: any, b: any) => {
    const dateA = new Date(a.fileDate), dateB = new Date(b.fileDate);
    return new Date(dateB.getMilliseconds() - dateA.getMilliseconds());
}

const makeRequest = async (url: string, params: {} = {}) => {
    const requestPayload = {
        params
    };
    try {
        const response = await axios.get(url, requestPayload);
        return response.data;
    } catch (err) {
        log.error(err);
    }
};

export const getAddon = async (addonID: number | string) => {
    const url = `${CURSEMETA_API_URL}/addon/${addonID}`;
    return makeRequest(url);
};

export const getAddonFiles = async (addonID: number | string) => {
    const url = `${CURSEMETA_API_URL}/addon/${addonID}/files`;
    const data = await makeRequest(url);
    return data.sort(sortByDate);
};

export const getAddonDescription = async (addonID: number | string) => {
    const url = `${CURSEMETA_API_URL}/addon/${addonID}/description`;
    return makeRequest(url);
};

export const getAddonFile = async (
    addonID: number | string,
    fileID: number | string
) => {
    const url = `${CURSEMETA_API_URL}/addon/${addonID}/file/${fileID}`;
    return makeRequest(url);
};

export const getAddonFileChangelog = async (
    addonID: number | string,
    fileID: number | string
) => {
    const url = `${CURSEMETA_API_URL}/addon/${addonID}/file/${fileID}/changelog`;
    return makeRequest(url);
};

export const getAddonFileIDFromVersion = async (
    addonID: number | string,
    modpackVersion: string
) => {
    const files = await getAddonFiles(addonID);
    const foundID = files.find((a: any) => a.fileName.includes(modpackVersion));
    return foundID ? foundID.id : null;
};

export const getSearch = (
    type: 'mods' | 'modpacks',
    searchFilter: string,
    pageSize: number,
    index: number,
    sort:
        | 'Featured'
        | 'Popularity'
        | 'LastUpdated'
        | 'Name'
        | 'Author'
        | 'TotalDownloads',
    isSortDescending: boolean,
    gameVersion?: string
) => {
    const url = `${CURSEMETA_API_URL}/addon/search`;
    const params: {} = {
        gameId: 432,
        sectionId: CATEGORY_ID[type],
        categoryId: 0,
        pageSize,
        sort,
        isSortDescending,
        index,
        searchFilter,
        gameVersion: gameVersion || ''
    };
    return makeRequest(url, params);
};