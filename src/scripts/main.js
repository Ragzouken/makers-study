/**
 * @param {string} query 
 * @param {ParentNode} element 
 * @returns {HTMLElement}
 */
const ONE = (query, element = undefined) => (element || document).querySelector(query);
/**
 * @param {string} query 
 * @param {HTMLElement | Document} element 
 * @returns {HTMLElement[]}
 */
const ALL = (query, element = undefined) => Array.from((element || document).querySelectorAll(query));
/**
 * @template {keyof WindowEventMap} K
 * @param {Window | Document | Element} element 
 * @param {K} type 
 * @param {(event: WindowEventMap[K]) => any} listener
 * @returns {() => void}
 */
function LISTEN(element, type, listener) {
    element.addEventListener(type, listener);
    return () => element.removeEventListener(type, listener);
}

/**
 * @template T
 * @param {T} object
 * @returns {T}
 */
const COPY = (object) => JSON.parse(JSON.stringify(object));

/**
 * @param {number} length 
 * @returns {number[]}
 */
const ZEROES = (length) => Array(length).fill(0);

/**
 * @param {number} min 
 * @param {number} max 
 * @returns {number}
 */
function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min)) + min;
}

class RadioGroupWrapper extends EventTarget {
    /** @param {HTMLInputElement[]} inputs */
    constructor(inputs) {
        super();
        this.inputs = inputs;

        inputs.forEach((input) => {
            input.addEventListener("change", () => {
                if (!input.checked) return;
                this.dispatchEvent(new CustomEvent("change"));
            });
        });
    }

    get selectedIndex() {
        return this.inputs.findIndex((button) => button.checked); 
    }

    set selectedIndex(value) {
        this.inputs[value].click();
    }

    get selectedInput() {
        return this.inputs[this.selectedIndex];
    }

    get value() {
        return this.selectedInput?.value;
    }
}

class ButtonAction extends EventTarget {
    /** @param {HTMLButtonElement[]} buttons */
    constructor(buttons) {
        super();
        this.buttons = buttons;
        this.disabled = false;

        buttons.forEach((button) => {
            button.addEventListener("click", () => this.invoke());
        });
    }

    get disabled() {
        return this._disabled;
    }

    set disabled(value) {
        this._disabled = value;
        this.buttons.forEach((button) => button.disabled = value);
    }

    invoke(force = false) {
        if (!force && this.disabled) return;
        this.dispatchEvent(new CustomEvent("invoke"));
    }
}

/**
 * @param {string} name
 */
function RADIO(name) {
    const buttons = ALL(`input[type="radio"][name="${name}"]`);
    return new RadioGroupWrapper(buttons);
}

/**
 * @param {string} name
 * @returns {HTMLButtonElement}
 */
 function BUTTON(name) {
    return ONE(`button[name="${name}"]`);
}

/**
 * @param {string} name
 * @returns {ButtonAction}
 */
 function ACTION(name) {
    const buttons = ALL(`button[name="${name}"]`);
    return new ButtonAction(buttons);
}

/**
 * @param {string} name
 * @returns {HTMLSelectElement}
 */
function SELECT(name) {
    return ONE(`select[name="${name}"]`);
}

function RENDERING2D(width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas.getContext("2d");
} 

/** @param {HTMLImageElement} image */
function imageToRendering2D(image) {
    const rendering = RENDERING2D(image.naturalWidth, image.naturalHeight);
    rendering.drawImage(image, 0, 0);
    return rendering;
}

/**
 * @param {string} src
 * @returns {Promise<HTMLImageElement>} image
 */
 async function loadImage(src) {
    return new Promise((resolve, reject) => {
        const image = document.createElement("img");
        image.addEventListener("load", () => resolve(image));
        image.src = src;
    });
}

async function imageDataURIresourceLoader(resource) {
    const image = await loadImage(resource.data);
    const rendering = imageToRendering2D(image);
    return rendering;
}

const resourceTypes = {
    "canvas-datauri": {
        load: async (resource) => {
            const image = await loadImage(resource.data);
            return imageToRendering2D(image);
        },

        copy: async (instance) => {
            const copy = RENDERING2D(instance.canvas.width, instance.canvas.height);
            copy.drawImage(instance.canvas, 0, 0);
            return copy;
        },

        save: async (instance) => {
            return instance.canvas.toDataURL();
        }
    }
}

class FlickgameStateManager extends EventTarget {
    constructor() {
        super();

        /** @type {Map<string, CanvasRenderingContext2D>} */
        this.rendering2ds = new Map();

        /** @type {FlickgameDataProject[]} */
        this.history = [];
        this.index = -1;
        this.historyLimit = 20;
        this.dirty = undefined;
    }

    get data() {
        return this.history[this.index];
    }

    get canUndo() {
        return this.index > 0 || this.dirty;
    }

    get canRedo() {
        return this.index < this.history.length - 1 && !this.dirty;
    }

    /** @param {ProjectBundle<FlickgameDataProject>} bundle */
    async loadBundle(bundle) {
        this.lastId = 0;
        this.history.length = 0;
        this.history.push(bundle.project);
        this.index = 0;

        const promises = Object.entries(bundle.resources).map(async ([id, resource]) => {
            const instance = await resourceTypes[resource.type].load(resource);
            this.rendering2ds.set(id, instance);
        });
        await Promise.all(promises);

        this.dispatchEvent(new CustomEvent("change"));
    }

    async makeBundle() {
        const project = COPY(this.data);
        const resources = {};
        this.rendering2ds.forEach((rendering, id) => {
            const data = rendering.canvas.toDataURL();
            resources[id] = { type: "canvas-datauri", data };
        });

        return { project, resources };
    }

    nextId() {
        while (this.rendering2ds.has(this.lastId.toString())) {
            this.lastId += 1;
        }

        return this.lastId.toString();
    }

    addRendering(rendering) {
        const id = this.nextId();
        this.rendering2ds.set(id, rendering);
        return id;
    }

    makeCheckpoint() {
        this.dirty = undefined;
        this.history.length = this.index + 1;
        
        const currentData = this.data;

        this.history[this.index] = COPY(currentData);
        this.history.push(currentData);
        
        if (this.index < this.historyLimit) {
            this.index += 1;
        } else {
            // delete earliest history
            this.history.splice(0, 1);
        }
    }

    undo() {
        if (!this.canUndo) return;
        this.index -= 1;
        this.dirty = undefined;
        this.dispatchEvent(new CustomEvent("change"));
    }

    redo() {
        if (!this.canRedo) return;
        this.index += 1;
        this.dirty = undefined;
        this.dispatchEvent(new CustomEvent("change"));
    }
}

/** @returns {ProjectBundle<FlickgameDataProject>} */
function makeBlankBundle() {
    const blank = RENDERING2D(160, 100);
    blank.fillStyle = "#140c1c";
    blank.fillRect(0, 0, 160, 100);
    const scenes = ZEROES(16).map(() => ({ image: "0", jumps: {} }));
    const project = { scenes };
    const resources = {
        "0": { type: "canvas-datauri", data: blank.canvas.toDataURL() },
    };

    return { project, resources };
}

async function start() {
    const palette = [
        "#140c1c", "#442434", "#30346d", "#4e4a4e",
        "#854c30", "#346524", "#d04648", "#757161",
        "#597dce", "#d27d2c", "#8595a1", "#6daa2c",
        "#d2aa99", "#6dc2ca", "#dad45e", "#deeed6",
    ];

    const brushes = [
        { name: "1px circle", image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAABlJREFUOI1jYBgFwx38/////0C7YRQMDQAApd4D/cefQokAAAAASUVORK5CYII=" },
        { name: "2px circle", image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAABpJREFUOI1jYBgFwx38hwJ8apjo5ZhRMKgBADvbB/vPRl6wAAAAAElFTkSuQmCC" },
        { name: "3px circle", image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAACNJREFUOI1jYBgFgxz8////PyE1jMRoZmRkxKmOYheMgmEBAARbC/qDr1pMAAAAAElFTkSuQmCC" },
        { name: "4px circle", image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAChJREFUOI1jYBgFgxz8hwJ8ahjxaUZRyMiIVS0TeW4jEhDjhVEwGAAAJhAT9IYiYRoAAAAASUVORK5CYII=" },
    ];

    const patterns = [
        { name: "solid", image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQAQMAAAAlPW0iAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAADUExURf///6fEG8gAAAAJcEhZcwAADsIAAA7CARUoSoAAAAANSURBVBjTYyAJMDAAAAAwAAHT27rKAAAAAElFTkSuQmCC" },
        { name: "dither", image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAGUExURf///wAAAFXC034AAAACdFJOU/8A5bcwSgAAAAlwSFlzAAAOwwAADsMBx2+oZAAAABFJREFUKFNjYGAkAEeSCkYGAEUQAIFA2DR1AAAAAElFTkSuQmCC" },
        { name: "dither", image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAGUExURf///wAAAFXC034AAAACdFJOU/8A5bcwSgAAAAlwSFlzAAAOwwAADsMBx2+oZAAAABFJREFUKFNjYGAkAEeSCkYGAEUQAIFA2DR1AAAAAElFTkSuQmCC" },
        { name: "dither", image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAGUExURf///wAAAFXC034AAAACdFJOU/8A5bcwSgAAAAlwSFlzAAAOwwAADsMBx2+oZAAAABFJREFUKFNjYGAkAEeSCkYGAEUQAIFA2DR1AAAAAElFTkSuQmCC" },
        { name: "dither", image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAGUExURf///wAAAFXC034AAAACdFJOU/8A5bcwSgAAAAlwSFlzAAAOwwAADsMBx2+oZAAAABFJREFUKFNjYGAkAEeSCkYGAEUQAIFA2DR1AAAAAElFTkSuQmCC" },
        { name: "dither", image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAGUExURf///wAAAFXC034AAAACdFJOU/8A5bcwSgAAAAlwSFlzAAAOwwAADsMBx2+oZAAAABFJREFUKFNjYGAkAEeSCkYGAEUQAIFA2DR1AAAAAElFTkSuQmCC" },
        { name: "dither", image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAGUExURf///wAAAFXC034AAAACdFJOU/8A5bcwSgAAAAlwSFlzAAAOwwAADsMBx2+oZAAAABFJREFUKFNjYGAkAEeSCkYGAEUQAIFA2DR1AAAAAElFTkSuQmCC" },
        { name: "dither", image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAGUExURf///wAAAFXC034AAAACdFJOU/8A5bcwSgAAAAlwSFlzAAAOwwAADsMBx2+oZAAAABFJREFUKFNjYGAkAEeSCkYGAEUQAIFA2DR1AAAAAElFTkSuQmCC" },
    ];

    const demo = await loadImage("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKAAAABkBAMAAADzmCa8AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAMUExURRQMHG2qLN7u1tJ9LAlotEkAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAMUSURBVGjezdmJkesgDABQIA1ABx6lgUzov7cPEmAwh4Vh50d7xgsv4jBZiPgfYTZ70ujd4F5P7E7wKaigcVHq5yDAUV80HtsLmu2gfg7WnegmDIFSr4JHBNGU5pyKrYb0wLNoGHICJTY8/QWegJCDIvOeg0cOZj04BUJWKwfzm5kPqiaoryAsgTQPF8DjCob5olfB89dqRgNwJ2IbHJXig2obCHe1sNA82K8Fm0EsMzPKdyA8AxsdRanhdfbyNQLh9AQ7TqaqCY9A0QVhMwhFPABVCcImsOOtggo2gFnF2psZlQYIyyAUY9JIcEasQYAlUeWgeHUSBP64lKD9dMHJ5QYSCPD+wkqzA/jGCvbjnsBaWBEDaL/+h/24R7aXIU90xd4fLsjpSWwjgu7p0RqC90kiqLwixMv3Xr8LeUkm0CeI8b0Bxzn6eRJB8u4SHIgv38gIpgBGdEA3jRGECL55XFdE0HeZuze8JyDvwaMW1E2rE0hV/Lesya76UWWkhim69opToLLJP3CbUSekBim+LDW020tRjEt6vgC32+ziM1iiVf7PaGLUqM0uwdGaXxDpch/0wyLai34oUF6gfYKCtF+oMywbdE2wHgJa3dvZDcGzTOHhHm0AUosbbe7f/8MNgQ2gK/TuJVjFAHxZm561XLNGC9RoYxpbXGUoFkOxe5AbwVF/BfaKSVHsee/BuwT9UY6ZAo8LKCuQeeBEoILrVuBSexI8IpgJxpwdp6vDlxtQVCAeLsWOa5zm9INuUP9Zge5Lz4MhzxqMqH9Un+bcpin6oNSroEwgDo2h8z+hJ0B64UynS+FsCY8m3QeB0jwFfWIR9OOCwx2bz/MU5NtxX1sn0Es42pSleQSeg0Dd6Oc43ir5yecjMFBxhLH9PDBfGzxoRMgo3cL0mDl1VLFenyB1GQ1ENvSMKF5QENTX8XQjMnX/qRyUrb731/QkmE5NW3NYnn3JBmNN07zL6BJzahf/FUjzO2/69EOaXwanRpMRcdXfBpL102B86dwX1zcslkOazW/gSvZazw1c+3fGRIOF+Af8sQAWZmiH2QAAAABJRU5ErkJggg==");
    const renderer = ONE("#renderer").getContext("2d");
    let copiedScene = undefined;

    const sceneSelect = RADIO("scene-select");
    const toolSelect = RADIO("tool-select");
    const brushSelect = RADIO("brush-select");
    const patternSelect = RADIO("pattern-select");
    const colorSelect = RADIO("color-select");
    const jumpSelect = SELECT("jump-select");

    const undo = ACTION("undo");
    const redo = ACTION("redo");
    const copy = ACTION("copy");
    const paste = ACTION("paste");
    const clear = ACTION("clear");

    const export_ = ACTION("export");
    const import_ = ACTION("import");
    const reset = ACTION("reset");

    const jumpColorIndicator = ONE("#jump-source-color");

    const test = ONE("#renderer");
    const thumbnails = ZEROES(16).map(() => {
        const thumbnail = RENDERING2D(160, 100);
        thumbnail.drawImage(test, 0, 0);
        return thumbnail;
    });

    undo.addEventListener("invoke", () => stateManager.undo());
    redo.addEventListener("invoke", () => stateManager.redo());

    copy.addEventListener("invoke", () => {
        const currentScene = stateManager.data.scenes[sceneSelect.selectedIndex];
        copiedScene = COPY(currentScene);

        paste.disabled = false;
    });

    paste.addEventListener("invoke", () => {
        stateManager.makeCheckpoint();
        stateManager.data.scenes[sceneSelect.selectedIndex] = copiedScene;
        stateManager.dispatchEvent(new CustomEvent("change"));
    });

    reset.addEventListener("invoke", () => {
        stateManager.loadBundle(makeBlankBundle());
        stateManager.dispatchEvent(new CustomEvent("change"));
    });

    export_.addEventListener("invoke", async () => {
        const bundle = await stateManager.makeBundle();
        console.log(bundle);
    });

    ALL("#scene-select input").forEach((input, index) => {
        input.after(thumbnails[index].canvas);
    });

    ALL("#color-select label").forEach((label, index) => {
        label.style.backgroundColor = palette[index];
    });

    ALL("#brush-select label").forEach((label, index) => {
        ONE("input", label).title = brushes[index].name + " brush";
        ONE("img", label).src = brushes[index].image;
    });

    ALL("#pattern-select label").forEach((label, index) => {
        ONE("input", label).title = patterns[index].name + " pattern";
        ONE("img", label).src = patterns[index].image;
    });

    colorSelect.addEventListener("change", () => {
        refreshJumpSelect();
    });

    const stateManager = new FlickgameStateManager();

    function refreshJumpSelect() {
        const currentScene = stateManager.data.scenes[sceneSelect.selectedIndex];
        if (!currentScene) return;

        const jump = currentScene.jumps[colorSelect.value];
        jumpSelect.value = jump ? jump : "none";

        jumpColorIndicator.style.backgroundColor = palette[colorSelect.selectedIndex];
    }

    stateManager.addEventListener("change", () => {
        stateManager.data.scenes.forEach((scene, index) => {
            const image = stateManager.rendering2ds.get(scene.image).canvas;
            thumbnails[index].drawImage(image, 0, 0);
        });

        const currentScene = stateManager.data.scenes[sceneSelect.selectedIndex];
        if (currentScene)
            renderer.drawImage(stateManager.rendering2ds.get(currentScene.image).canvas, 0, 0);

        undo.disabled = !stateManager.canUndo;
        redo.disabled = !stateManager.canRedo;

        refreshJumpSelect();
    });

    sceneSelect.addEventListener("change", () => {
        const currentScene = stateManager.data.scenes[sceneSelect.selectedIndex];
        if (currentScene)
            renderer.drawImage(stateManager.rendering2ds.get(currentScene.image).canvas, 0, 0);

        refreshJumpSelect();
    });

    jumpSelect.addEventListener("change", () => {
        stateManager.makeCheckpoint();
        
        const currentScene = stateManager.data.scenes[sceneSelect.selectedIndex];
        if (currentScene)
            currentScene.jumps[colorSelect.value] = jumpSelect.value;

        stateManager.dispatchEvent(new CustomEvent("change"));
    });

    await stateManager.loadBundle(makeBlankBundle());
    const init = RENDERING2D(160, 100);
    init.drawImage(demo, 0, 0);
    stateManager.data.scenes[0].image = stateManager.addRendering(init);
    stateManager.dispatchEvent(new CustomEvent("change"));

    sceneSelect.selectedIndex = 0;
    toolSelect.selectedIndex = 0;
    brushSelect.selectedIndex = getRandomInt(0, 4);
    patternSelect.selectedIndex = getRandomInt(0, 8);
    colorSelect.selectedIndex = getRandomInt(7, 16);

    undo.disabled = true;
    redo.disabled = true;
    paste.disabled = true;

    clear.addEventListener("invoke", () => {
        stateManager.makeCheckpoint();

        const scene = stateManager.data.scenes[sceneSelect.selectedIndex];
        const edit = RENDERING2D(160, 100);
        edit.drawImage(stateManager.rendering2ds.get(scene.image).canvas, 0, 0);
        edit.fillStyle = palette[colorSelect.selectedIndex];
        edit.fillRect(0, 0, 160, 100);
        scene.image = stateManager.addRendering(edit);
        stateManager.dispatchEvent(new CustomEvent("change"));
    });
}
