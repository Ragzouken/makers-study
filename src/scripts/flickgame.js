/**
 * @typedef {Object} FlickgameDataScene
 * @property {string} image
 * @property {{[index: string]: string}} jumps
 */

/**
 * @typedef {Object} FlickgameDataProject
 * @property {FlickgameDataScene[]} scenes
 */

/** @param {FlickgameDataProject} data */
function getFlickgameManifest(data) {
    return data.scenes.map((scene) => scene.image);
}

/** @returns {maker.ProjectBundle<FlickgameDataProject>} */
function makeBlankBundle() {
    const blank = createRendering2D(160, 100);
    blank.fillStyle = "#140c1c";
    blank.fillRect(0, 0, 160, 100);
    const scenes = ZEROES(16).map(() => ({ image: "0", jumps: {} }));
    const project = { scenes };
    const resources = {
        "0": { type: "canvas-datauri", data: blank.canvas.toDataURL() },
    };

    return { project, resources };
}
