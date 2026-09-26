import {
    ShellComponentContainer,
    NoticeKey,
} from "@takeover/shared-utils";

const script = document.createElement("script");
script.setAttribute("type", "module");
script.setAttribute("src", chrome.runtime.getURL("document.js"));

const componentContainer = document.createElement('div')
componentContainer.id = ShellComponentContainer

const componentLink = document.createElement('link')
componentLink.rel = 'stylesheet'
componentLink.href = chrome.runtime.getURL("components/style.css")
const components = document.createElement("script");
components.setAttribute("src", chrome.runtime.getURL("components/index.iife.js"));

let documentReady = false;
let componentsReady = false;
let pendingOpenRequests = 0;

function openModal() {
    if (!documentReady || !componentsReady) {
        pendingOpenRequests += 1;
        return;
    }

    window.dispatchEvent(
        new CustomEvent(NoticeKey.COMMAND_TRIGGERING, {
            detail: { to: 'document', value: "open_modal" },
        })
    );
}

// Register immediately so a toolbar click during page startup is not lost.
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === NoticeKey.COMMAND_TRIGGERING && msg.to === "content") {
        openModal();
    }
});

function flushOpenRequests() {
    if (!documentReady || !componentsReady) return;
    while (pendingOpenRequests > 0) {
        pendingOpenRequests -= 1;
        openModal();
    }
}

script.addEventListener('load', () => {
    documentReady = true;
    flushOpenRequests();
}, { once: true });
components.addEventListener('load', () => {
    componentsReady = true;
    flushOpenRequests();
}, { once: true });

document.documentElement.appendChild(script);
document.documentElement.appendChild(componentLink);
document.documentElement.appendChild(componentContainer);
document.documentElement.appendChild(components);
