import { registerEl } from "./utils/register";
import Modal from "./modal/index";
// import Test from "./test/index";

const ComponentMap = {
    modal: Modal,
    // test: Test
}

type ComponentName = keyof typeof ComponentMap

export function register(name: ComponentName, container?: Element) {
    const target = ComponentMap[name]
    registerEl(target, container)
}

if (import.meta.env.DEV) {
    register('modal')
}