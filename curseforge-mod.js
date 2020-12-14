// ==UserScript==
// @name         CurseForge Mod
// @namespace    https://github.com/lmarianski/mcbuilder
// @downloadURL  https://raw.githubusercontent.com/lmarianski/mcbuilder/master/curseforge-mod.js
// @version      0.1
// @description  Replace indirect "Install" (https://www.curseforge.com/<game>/<category/<slug>/download?client=y) links with direct ones (curseforge://install?addonId=<id>)
// @author       lmarianski
// @match        https://www.curseforge.com/*
// @grant        none
// ==/UserScript==

(function () {
	'use strict';

	document
		.querySelectorAll('a[style="background-color: #de6a3b"')
		.forEach(v => fetch(v.href)
			.then(res => res.url.split("?")[1])
			.then(query => { v.href = "curseforge://install?" + query; return v }));
	// .then(query => [query.split("&")[0],query.split("&")[0]])
	// .then(queryChunk => [queryChunk[0].split("=")[1], queryChunk[1].split("=")[1]])
	// .then(ids => $('a[style="background-color: #de6a3b"')[k].href=`curseforge://install?addonId=${ids[0]}&fileId=${ids[1]}`));
})();