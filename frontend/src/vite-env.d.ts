/// <reference types="vite/client" />

// kand ships its WASM as a plain asset. Vite's client types only cover
// `*.wasm?init`, so declare the `?url` import used by TaCandleChart.
declare module '*.wasm?url' {
  const src: string
  export default src
}
