// Static SVGs adapted from fixed T3 / Lobe Icons sources. See docs/engineering/provider-brand-assets.md.
import type { ReactNode } from "react";
import { magpieAssets } from "./magpie-assets";

// Literal colors belong to these third-party brand assets, never the App theme.
// Preserve the fixed SVG source palette without exporting it to consumers.
const sourceColors = {
  color0: "#22B8CD",
  color1: "#4D6BFE",
  color2: "#0082FB",
  color3: "#0867DF",
  color4: "#0668E1",
  color5: "#0064E0",
  color6: "#0064DF",
  color7: "#0072EC",
  color8: "#007CF6",
  color9: "#007FF9",
  color10: "#007FF8",
  color11: "#0081FA",
  color12: "#0080F9",
  color13: "#027AF3",
  color14: "#0377EF",
  color15: "#0279F1",
  color16: "#0471E9",
  color17: "#4285F4",
  color18: "#34A853",
  color19: "#FBBC05",
  color20: "#EB4335",
  color21: "#5019C5",
  color22: "#FF9D0B",
  color23: "#FFD21E",
  color24: "#FF323D",
  color25: "#3A3B45",
  color26: "#EF2CC1",
  color27: "#CAAEF5",
  color28: "#FC4C02",
  color29: "#3186FF",
  color30: "#08B962",
  color31: "#F94543",
  color32: "#FABC12",
  color33: "#74B71B",
  color34: "#F90",
  color35: "#39594D",
  color36: "#D18EE2",
  color37: "#FF7759",
  color38: "#6336E7",
  color39: "#6F69F7",
  color40: "#1783FF",
  color42: "#FF6003",
  color43: "gold",
  color44: "#FFAF00",
  color45: "#FF8205",
  color46: "#FA500F",
  color47: "#E10500",
  color48: "#F15A29",
  color49: "#E2167E",
  color50: "#FE603C",
  color51: "#0078D4",
  color52: "#114A8B",
  color53: "#0669BC",
  color54: "#3CCBF4",
  color55: "#2892DF",
} as const;

type BrandAsset = {
  viewBox: string;
  fill: string;
  fillRule?: "evenodd";
  content: (id: string) => ReactNode;
};

// T3 ships this original brand asset as an embedded PNG. No external request.
const antigravityDataUrl =
  "data:image/png;base64,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";

export const brandAssets = {
  ...magpieAssets,
  antigravity: {
    viewBox: "0 0 128 128",
    fill: "none",
    content: (_id: string) => (
      <image href={antigravityDataUrl} width="128" height="128" />
    ),
  },
  openai: {
    viewBox: "100 100 411 411",
    fill: "currentColor",
    content: (_id: string) => (
      <>
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M252.794 108.802C289.191 99.0484 326.265 110.305 351.148 135.135C385.113 126.072 422.85 134.862 449.492 161.505C476.136 188.149 484.925 225.888 475.862 259.85V259.854C500.696 284.735 511.95 321.81 502.198 358.207C492.447 394.602 464.161 421.084 430.215 430.217C421.083 464.162 394.603 492.448 358.206 502.199C321.812 511.951 284.734 500.693 259.852 475.864C225.887 484.927 188.15 476.137 161.507 449.495C134.864 422.851 126.073 385.111 135.136 351.149C110.304 326.266 99.0496 289.192 108.801 252.795C118.552 216.4 146.84 189.918 180.784 180.785C189.917 146.841 216.396 118.553 252.794 108.802ZM374.292 407.145C374.292 411.271 372.092 415.086 368.517 417.148L283.723 466.102C302.487 480.585 327.555 486.459 352.217 479.852C386.997 470.532 410.068 439.312 410.555 405.006V317.717C410.555 315.08 409.125 312.621 406.843 311.303L374.292 292.509V407.145ZM251.868 415.897C248.296 417.959 243.893 417.959 240.317 415.897L155.526 366.942C152.366 390.436 159.811 415.08 177.866 433.136H177.863C203.325 458.594 241.896 462.962 271.85 446.232L347.449 402.586C349.735 401.268 351.148 398.8 351.148 396.163V358.579L251.868 415.897ZM368.602 220.628C366.319 219.309 363.474 219.318 361.191 220.637L328.641 239.431L427.921 296.749C431.496 298.811 433.697 302.627 433.697 306.752V404.661C455.622 395.654 473.244 376.881 479.851 352.218C489.169 317.442 473.668 281.85 444.201 264.274L368.602 220.628ZM177.303 206.34C155.377 215.348 137.756 234.122 131.148 258.783C121.832 293.561 137.331 329.153 166.799 346.727L242.398 390.373C244.68 391.692 247.525 391.684 249.807 390.366L282.357 371.572L183.078 314.253C179.504 312.189 177.303 308.375 177.303 304.251V206.34ZM259.849 279.145V331.858L305.5 358.213L351.15 331.858V279.145L305.5 252.789L259.849 279.145ZM327.276 144.9C308.512 130.418 283.445 124.543 258.782 131.15C224.002 140.471 200.931 171.691 200.445 205.995V293.286C200.445 295.923 201.875 298.381 204.158 299.7L236.707 318.493V203.856C236.707 199.731 238.909 195.916 242.483 193.853L327.276 144.9ZM433.137 177.867C407.675 152.407 369.103 148.038 339.149 164.769L263.55 208.415C261.265 209.734 259.852 212.202 259.852 214.838V252.423L359.132 195.105C362.703 193.041 367.108 193.041 370.682 195.105L455.473 244.06C458.635 220.567 451.189 195.922 433.135 177.867H433.137Z"
        />
      </>
    ),
  },
  anthropic: {
    viewBox: "0 0 256 257",
    fill: "#d97757",
    content: (_id: string) => (
      <>
        <path d="m50.228 170.321 50.357-28.257.843-2.463-.843-1.361h-2.462l-8.426-.518-28.775-.778-24.952-1.037-24.175-1.296-6.092-1.297L0 125.796l.583-3.759 5.12-3.434 7.324.648 16.202 1.101 24.304 1.685 17.629 1.037 26.118 2.722h4.148l.583-1.685-1.426-1.037-1.101-1.037-25.147-17.045-27.22-18.017-14.258-10.37-7.713-5.25-3.888-4.925-1.685-10.758 7-7.713 9.397.649 2.398.648 9.527 7.323 20.35 15.75L94.817 91.9l3.889 3.24 1.555-1.102.195-.777-1.75-2.917-14.453-26.118-15.425-26.572-6.87-11.018-1.814-6.61c-.648-2.723-1.102-4.991-1.102-7.778l7.972-10.823L71.42 0 82.05 1.426l4.472 3.888 6.61 15.101 10.694 23.786 16.591 32.34 4.861 9.592 2.592 8.879.973 2.722h1.685v-1.556l1.36-18.211 2.528-22.36 2.463-28.776.843-8.1 4.018-9.722 7.971-5.25 6.222 2.981 5.12 7.324-.713 4.73-3.046 19.768-5.962 30.98-3.889 20.739h2.268l2.593-2.593 10.499-13.934 17.628-22.036 7.778-8.749 9.073-9.657 5.833-4.601h11.018l8.1 12.055-3.628 12.443-11.342 14.388-9.398 12.184-13.48 18.147-8.426 14.518.778 1.166 2.01-.194 30.46-6.481 16.462-2.982 19.637-3.37 8.88 4.148.971 4.213-3.5 8.62-20.998 5.184-24.628 4.926-36.682 8.685-.454.324.519.648 16.526 1.555 7.065.389h17.304l32.21 2.398 8.426 5.574 5.055 6.805-.843 5.184-12.962 6.611-17.498-4.148-40.83-9.721-14-3.5h-1.944v1.167l11.666 11.406 21.387 19.314 26.767 24.887 1.36 6.157-3.434 4.86-3.63-.518-23.526-17.693-9.073-7.972-20.545-17.304h-1.36v1.814l4.73 6.935 25.017 37.59 1.296 11.536-1.814 3.76-6.481 2.268-7.13-1.297-14.647-20.544-15.1-23.138-12.185-20.739-1.49.843-7.194 77.448-3.37 3.953-7.778 2.981-6.48-4.925-3.436-7.972 3.435-15.749 4.148-20.544 3.37-16.333 3.046-20.285 1.815-6.74-.13-.454-1.49.194-15.295 20.999-23.267 31.433-18.406 19.702-4.407 1.75-7.648-3.954.713-7.064 4.277-6.286 25.47-32.405 15.36-20.092 9.917-11.6-.065-1.686h-.583L44.07 198.125l-12.055 1.555-5.185-4.86.648-7.972 2.463-2.593 20.35-13.999-.064.065Z" />
      </>
    ),
  },
  cursor: {
    viewBox: "0 0 466.73 532.09",
    fill: "currentColor",
    content: (_id: string) => (
      <>
        <path d="M457.43,125.94L244.42,2.96c-6.84-3.95-15.28-3.95-22.12,0L9.3,125.94c-5.75,3.32-9.3,9.46-9.3,16.11v247.99c0,6.65,3.55,12.79,9.3,16.11l213.01,122.98c6.84,3.95,15.28,3.95,22.12,0l213.01-122.98c5.75-3.32,9.3-9.46,9.3-16.11v-247.99c0-6.65-3.55-12.79-9.3-16.11h-.01ZM444.05,151.99l-205.63,356.16c-1.39,2.4-5.06,1.42-5.06-1.36v-233.21c0-4.66-2.49-8.97-6.53-11.31L24.87,145.67c-2.4-1.39-1.42-5.06,1.36-5.06h411.26c5.84,0,9.49,6.33,6.57,11.39h-.01Z" />
      </>
    ),
  },
  grok: {
    viewBox: "0 0 24 24",
    fill: "currentColor",
    content: (_id: string) => (
      <>
        <path d="M9.26905 15.284L17.2479 9.36086C17.6391 9.07047 18.1981 9.18374 18.3845 9.63478C19.3655 12.0135 18.9272 14.8721 16.9755 16.8349C15.0238 18.7976 12.3082 19.228 9.8261 18.2477L7.1146 19.5102C11.0037 22.1834 15.7263 21.5223 18.6774 18.5525C21.0182 16.1985 21.7432 12.9897 21.0653 10.0961L21.0714 10.1023C20.0884 5.85143 21.3131 4.15233 23.8218 0.677913C23.8812 0.595532 23.9406 0.513151 24 0.428711L20.6987 3.74866V3.73836L9.267 15.2861" />
        <path d="M7.62249 16.7237C4.83113 14.0422 5.3124 9.89222 7.69417 7.49905C9.45541 5.72786 12.341 5.00497 14.86 6.06768L17.5653 4.81138C17.0779 4.45714 16.4533 4.07613 15.7365 3.80839C12.4966 2.46764 8.6178 3.13492 5.98413 5.78141C3.45081 8.32904 2.65415 12.2463 4.02219 15.5889C5.04412 18.0871 3.36889 19.8541 1.68137 21.6377C1.08337 22.2699 0.483318 22.9022 0 23.5716L7.62045 16.7257" />
      </>
    ),
  },
  apple: {
    viewBox: "0 0 24 24",
    fill: "currentColor",
    content: (_id: string) => (
      <>
        <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
      </>
    ),
  },
  perplexity: {
    viewBox: "0 0 24 24",
    fill: "none",
    content: (_id: string) => (
      <>
        <path
          d="M19.785 0v7.272H22.5V17.62h-2.935V24l-7.037-6.194v6.145h-1.091v-6.152L4.392 24v-6.465H1.5V7.188h2.884V0l7.053 6.494V.19h1.09v6.49L19.786 0zm-7.257 9.044v7.319l5.946 5.234V14.44l-5.946-5.397zm-1.099-.08l-5.946 5.398v7.235l5.946-5.234V8.965zm8.136 7.58h1.844V8.349H13.46l6.105 5.54v2.655zm-8.982-8.28H2.59v8.195h1.8v-2.576l6.192-5.62zM5.475 2.476v4.71h5.115l-5.115-4.71zm13.219 0l-5.115 4.71h5.115v-4.71z"
          fill={sourceColors.color0}
          fillRule="nonzero"
        />
      </>
    ),
  },
  zai: {
    viewBox: "0 0 24 24",
    fill: "currentColor",
    fillRule: "evenodd",
    content: (_id: string) => (
      <>
        <path d="M12.105 2L9.927 4.953H.653L2.83 2h9.276zM23.254 19.048L21.078 22h-9.242l2.174-2.952h9.244zM24 2L9.264 22H0L14.736 2H24z" />
      </>
    ),
  },
  githubcopilot: {
    viewBox: "0 0 24 24",
    fill: "currentColor",
    fillRule: "evenodd",
    content: (_id: string) => (
      <>
        <path d="M19.245 5.364c1.322 1.36 1.877 3.216 2.11 5.817.622 0 1.2.135 1.592.654l.73.964c.21.278.323.61.323.955v2.62c0 .339-.173.669-.453.868C20.239 19.602 16.157 21.5 12 21.5c-4.6 0-9.205-2.583-11.547-4.258-.28-.2-.452-.53-.453-.868v-2.62c0-.345.113-.679.321-.956l.73-.963c.392-.517.974-.654 1.593-.654l.029-.297c.25-2.446.81-4.213 2.082-5.52 2.461-2.54 5.71-2.851 7.146-2.864h.198c1.436.013 4.685.323 7.146 2.864zm-7.244 4.328c-.284 0-.613.016-.962.05-.123.447-.305.85-.57 1.108-1.05 1.023-2.316 1.18-2.994 1.18-.638 0-1.306-.13-1.851-.464-.516.165-1.012.403-1.044.996a65.882 65.882 0 00-.063 2.884l-.002.48c-.002.563-.005 1.126-.013 1.69.002.326.204.63.51.765 2.482 1.102 4.83 1.657 6.99 1.657 2.156 0 4.504-.555 6.985-1.657a.854.854 0 00.51-.766c.03-1.682.006-3.372-.076-5.053-.031-.596-.528-.83-1.046-.996-.546.333-1.212.464-1.85.464-.677 0-1.942-.157-2.993-1.18-.266-.258-.447-.661-.57-1.108-.32-.032-.64-.049-.96-.05zm-2.525 4.013c.539 0 .976.426.976.95v1.753c0 .525-.437.95-.976.95a.964.964 0 01-.976-.95v-1.752c0-.525.437-.951.976-.951zm5 0c.539 0 .976.426.976.95v1.753c0 .525-.437.95-.976.95a.964.964 0 01-.976-.95v-1.752c0-.525.437-.951.976-.951zM7.635 5.087c-1.05.102-1.935.438-2.385.906-.975 1.037-.765 3.668-.21 4.224.405.394 1.17.657 1.995.657h.09c.649-.013 1.785-.176 2.73-1.11.435-.41.705-1.433.675-2.47-.03-.834-.27-1.52-.63-1.813-.39-.336-1.275-.482-2.265-.394zm6.465.394c-.36.292-.6.98-.63 1.813-.03 1.037.24 2.06.675 2.47.968.957 2.136 1.104 2.776 1.11h.044c.825 0 1.59-.263 1.995-.657.555-.556.765-3.187-.21-4.224-.45-.468-1.335-.804-2.385-.906-.99-.088-1.875.058-2.265.394zM12 7.615c-.24 0-.525.015-.84.044.03.16.045.336.06.526l-.001.159a2.94 2.94 0 01-.014.25c.225-.022.425-.027.612-.028h.366c.187 0 .387.006.612.028-.015-.146-.015-.277-.015-.409.015-.19.03-.365.06-.526a9.29 9.29 0 00-.84-.044z" />
      </>
    ),
  },
  deepseek: {
    viewBox: "0 0 24 24",
    fill: "none",
    content: (_id: string) => (
      <>
        <path
          d="M23.748 4.482c-.254-.124-.364.113-.512.234-.051.039-.094.09-.137.136-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.156-.708-.311-.955-.65-.172-.241-.219-.51-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.093.172.187.129.323-.082.28-.18.552-.266.833-.055.179-.137.217-.329.14a5.526 5.526 0 01-1.736-1.18c-.857-.828-1.631-1.742-2.597-2.458a11.365 11.365 0 00-.689-.471c-.985-.957.13-1.743.388-1.836.27-.098.093-.432-.779-.428-.872.004-1.67.295-2.687.684a3.055 3.055 0 01-.465.137 9.597 9.597 0 00-2.883-.102c-1.885.21-3.39 1.102-4.497 2.623C.082 8.606-.231 10.684.152 12.85c.403 2.284 1.569 4.175 3.36 5.653 1.858 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.133-.284 4.994-1.86.47.234.962.327 1.78.397.63.059 1.236-.03 1.705-.128.735-.156.684-.837.419-.961-2.155-1.004-1.682-.595-2.113-.926 1.096-1.296 2.746-2.642 3.392-7.003.05-.347.007-.565 0-.845-.004-.17.035-.237.23-.256a4.173 4.173 0 001.545-.475c1.396-.763 1.96-2.015 2.093-3.517.02-.23-.004-.467-.247-.588zM11.581 18c-2.089-1.642-3.102-2.183-3.52-2.16-.392.024-.321.471-.235.763.09.288.207.486.371.739.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.167-1.361-.802-2.5-1.86-3.301-3.307-.774-1.393-1.224-2.887-1.298-4.482-.02-.386.093-.522.477-.592a4.696 4.696 0 011.529-.039c2.132.312 3.946 1.265 5.468 2.774.868.86 1.525 1.887 2.202 2.891.72 1.066 1.494 2.082 2.48 2.914.348.292.625.514.891.677-.802.09-2.14.11-3.054-.614zm1-6.44a.306.306 0 01.415-.287.302.302 0 01.2.288.306.306 0 01-.31.307.303.303 0 01-.304-.308zm3.11 1.596c-.2.081-.399.151-.59.16a1.245 1.245 0 01-.798-.254c-.274-.23-.47-.358-.552-.758a1.73 1.73 0 01.016-.588c.07-.327-.008-.537-.239-.727-.187-.156-.426-.199-.688-.199a.559.559 0 01-.254-.078c-.11-.054-.2-.19-.114-.358.028-.054.16-.186.192-.21.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.391.451.462.576.685.914.176.265.336.537.445.848.067.195-.019.354-.25.452z"
          fill={sourceColors.color1}
        />
      </>
    ),
  },
  meta: {
    viewBox: "0 0 24 24",
    fill: "none",
    content: (id: string) => (
      <>
        <path
          d="M6.897 4h-.024l-.031 2.615h.022c1.715 0 3.046 1.357 5.94 6.246l.175.297.012.02 1.62-2.438-.012-.019a48.763 48.763 0 00-1.098-1.716 28.01 28.01 0 00-1.175-1.629C10.413 4.932 8.812 4 6.896 4z"
          fill={`url(#meta-0-${id})`}
        />
        <path
          d="M6.873 4C4.95 4.01 3.247 5.258 2.02 7.17a4.352 4.352 0 00-.01.017l2.254 1.231.011-.017c.718-1.083 1.61-1.774 2.568-1.785h.021L6.896 4h-.023z"
          fill={`url(#meta-1-${id})`}
        />
        <path
          d="M2.019 7.17l-.011.017C1.2 8.447.598 9.995.274 11.664l-.005.022 2.534.6.004-.022c.27-1.467.786-2.828 1.456-3.845l.011-.017L2.02 7.17z"
          fill={`url(#meta-2-${id})`}
        />
        <path
          d="M2.807 12.264l-2.533-.6-.005.022c-.177.918-.267 1.851-.269 2.786v.023l2.598.233v-.023a12.591 12.591 0 01.21-2.44z"
          fill={`url(#meta-3-${id})`}
        />
        <path
          d="M2.677 15.537a5.462 5.462 0 01-.079-.813v-.022L0 14.468v.024a8.89 8.89 0 00.146 1.652l2.535-.585a4.106 4.106 0 01-.004-.022z"
          fill={`url(#meta-4-${id})`}
        />
        <path
          d="M3.27 16.89c-.284-.31-.484-.756-.589-1.328l-.004-.021-2.535.585.004.021c.192 1.01.568 1.85 1.106 2.487l.014.017 2.018-1.745a2.106 2.106 0 01-.015-.016z"
          fill={`url(#meta-5-${id})`}
        />
        <path
          d="M10.78 9.654c-1.528 2.35-2.454 3.825-2.454 3.825-2.035 3.2-2.739 3.917-3.871 3.917a1.545 1.545 0 01-1.186-.508l-2.017 1.744.014.017C2.01 19.518 3.058 20 4.356 20c1.963 0 3.374-.928 5.884-5.33l1.766-3.13a41.283 41.283 0 00-1.227-1.886z"
          fill={sourceColors.color2}
        />
        <path
          d="M13.502 5.946l-.016.016c-.4.43-.786.908-1.16 1.416.378.483.768 1.024 1.175 1.63.48-.743.928-1.345 1.367-1.807l.016-.016-1.382-1.24z"
          fill={`url(#meta-6-${id})`}
        />
        <path
          d="M20.918 5.713C19.853 4.633 18.583 4 17.225 4c-1.432 0-2.637.787-3.723 1.944l-.016.016 1.382 1.24.016-.017c.715-.747 1.408-1.12 2.176-1.12.826 0 1.6.39 2.27 1.075l.015.016 1.589-1.425-.016-.016z"
          fill={sourceColors.color2}
        />
        <path
          d="M23.998 14.125c-.06-3.467-1.27-6.566-3.064-8.396l-.016-.016-1.588 1.424.015.016c1.35 1.392 2.277 3.98 2.361 6.971v.023h2.292v-.022z"
          fill={`url(#meta-7-${id})`}
        />
        <path
          d="M23.998 14.15v-.023h-2.292v.022c.004.14.006.282.006.424 0 .815-.121 1.474-.368 1.95l-.011.022 1.708 1.782.013-.02c.62-.96.946-2.293.946-3.91 0-.083 0-.165-.002-.247z"
          fill={`url(#meta-8-${id})`}
        />
        <path
          d="M21.344 16.52l-.011.02c-.214.402-.519.67-.917.787l.778 2.462a3.493 3.493 0 00.438-.182 3.558 3.558 0 001.366-1.218l.044-.065.012-.02-1.71-1.784z"
          fill={`url(#meta-9-${id})`}
        />
        <path
          d="M19.92 17.393c-.262 0-.492-.039-.718-.14l-.798 2.522c.449.153.927.222 1.46.222.492 0 .943-.073 1.352-.215l-.78-2.462c-.167.05-.341.075-.517.073z"
          fill={`url(#meta-10-${id})`}
        />
        <path
          d="M18.323 16.534l-.014-.017-1.836 1.914.016.017c.637.682 1.246 1.105 1.937 1.337l.797-2.52c-.291-.125-.573-.353-.9-.731z"
          fill={`url(#meta-11-${id})`}
        />
        <path
          d="M18.309 16.515c-.55-.642-1.232-1.712-2.303-3.44l-1.396-2.336-.011-.02-1.62 2.438.012.02.989 1.668c.959 1.61 1.74 2.774 2.493 3.585l.016.016 1.834-1.914a2.353 2.353 0 01-.014-.017z"
          fill={`url(#meta-12-${id})`}
        />
        <defs>
          <linearGradient
            id={`meta-0-${id}`}
            x1="75.897%"
            x2="26.312%"
            y1="89.199%"
            y2="12.194%"
          >
            <stop offset=".06%" stopColor={sourceColors.color3} />
            <stop offset="45.39%" stopColor={sourceColors.color4} />
            <stop offset="85.91%" stopColor={sourceColors.color5} />
          </linearGradient>
          <linearGradient
            id={`meta-1-${id}`}
            x1="21.67%"
            x2="97.068%"
            y1="75.874%"
            y2="23.985%"
          >
            <stop offset="13.23%" stopColor={sourceColors.color6} />
            <stop offset="99.88%" stopColor={sourceColors.color5} />
          </linearGradient>
          <linearGradient
            id={`meta-2-${id}`}
            x1="38.263%"
            x2="60.895%"
            y1="89.127%"
            y2="16.131%"
          >
            <stop offset="1.47%" stopColor={sourceColors.color7} />
            <stop offset="68.81%" stopColor={sourceColors.color6} />
          </linearGradient>
          <linearGradient
            id={`meta-3-${id}`}
            x1="47.032%"
            x2="52.15%"
            y1="90.19%"
            y2="15.745%"
          >
            <stop offset="7.31%" stopColor={sourceColors.color8} />
            <stop offset="99.43%" stopColor={sourceColors.color7} />
          </linearGradient>
          <linearGradient
            id={`meta-4-${id}`}
            x1="52.155%"
            x2="47.591%"
            y1="58.301%"
            y2="37.004%"
          >
            <stop offset="7.31%" stopColor={sourceColors.color9} />
            <stop offset="100%" stopColor={sourceColors.color8} />
          </linearGradient>
          <linearGradient
            id={`meta-5-${id}`}
            x1="37.689%"
            x2="61.961%"
            y1="12.502%"
            y2="63.624%"
          >
            <stop offset="7.31%" stopColor={sourceColors.color9} />
            <stop offset="100%" stopColor={sourceColors.color2} />
          </linearGradient>
          <linearGradient
            id={`meta-6-${id}`}
            x1="34.808%"
            x2="62.313%"
            y1="68.859%"
            y2="23.174%"
          >
            <stop offset="27.99%" stopColor={sourceColors.color10} />
            <stop offset="91.41%" stopColor={sourceColors.color2} />
          </linearGradient>
          <linearGradient
            id={`meta-7-${id}`}
            x1="43.762%"
            x2="57.602%"
            y1="6.235%"
            y2="98.514%"
          >
            <stop offset="0%" stopColor={sourceColors.color2} />
            <stop offset="99.95%" stopColor={sourceColors.color11} />
          </linearGradient>
          <linearGradient
            id={`meta-8-${id}`}
            x1="60.055%"
            x2="39.88%"
            y1="4.661%"
            y2="69.077%"
          >
            <stop offset="6.19%" stopColor={sourceColors.color11} />
            <stop offset="100%" stopColor={sourceColors.color12} />
          </linearGradient>
          <linearGradient
            id={`meta-9-${id}`}
            x1="30.282%"
            x2="61.081%"
            y1="59.32%"
            y2="33.244%"
          >
            <stop offset="0%" stopColor={sourceColors.color13} />
            <stop offset="100%" stopColor={sourceColors.color12} />
          </linearGradient>
          <linearGradient
            id={`meta-10-${id}`}
            x1="20.433%"
            x2="82.112%"
            y1="50.001%"
            y2="50.001%"
          >
            <stop offset="0%" stopColor={sourceColors.color14} />
            <stop offset="99.94%" stopColor={sourceColors.color15} />
          </linearGradient>
          <linearGradient
            id={`meta-11-${id}`}
            x1="40.303%"
            x2="72.394%"
            y1="35.298%"
            y2="57.811%"
          >
            <stop offset=".19%" stopColor={sourceColors.color16} />
            <stop offset="100%" stopColor={sourceColors.color14} />
          </linearGradient>
          <linearGradient
            id={`meta-12-${id}`}
            x1="32.254%"
            x2="68.003%"
            y1="19.719%"
            y2="84.908%"
          >
            <stop offset="27.65%" stopColor={sourceColors.color3} />
            <stop offset="100%" stopColor={sourceColors.color16} />
          </linearGradient>
        </defs>
      </>
    ),
  },
  google: {
    viewBox: "0 0 24 24",
    fill: "none",
    content: (_id: string) => (
      <>
        <path
          d="M23 12.245c0-.905-.075-1.565-.236-2.25h-10.54v4.083h6.186c-.124 1.014-.797 2.542-2.294 3.569l-.021.136 3.332 2.53.23.022C21.779 18.417 23 15.593 23 12.245z"
          fill={sourceColors.color17}
        />
        <path
          d="M12.225 23c3.03 0 5.574-.978 7.433-2.665l-3.542-2.688c-.948.648-2.22 1.1-3.891 1.1a6.745 6.745 0 01-6.386-4.572l-.132.011-3.465 2.628-.045.124C4.043 20.531 7.835 23 12.225 23z"
          fill={sourceColors.color18}
        />
        <path
          d="M5.84 14.175A6.65 6.65 0 015.463 12c0-.758.138-1.491.361-2.175l-.006-.147-3.508-2.67-.115.054A10.831 10.831 0 001 12c0 1.772.436 3.447 1.197 4.938l3.642-2.763z"
          fill={sourceColors.color19}
        />
        <path
          d="M12.225 5.253c2.108 0 3.529.892 4.34 1.638l3.167-3.031C17.787 2.088 15.255 1 12.225 1 7.834 1 4.043 3.469 2.197 7.062l3.63 2.763a6.77 6.77 0 016.398-4.572z"
          fill={sourceColors.color20}
        />
      </>
    ),
  },
  xai: {
    viewBox: "0 0 24 24",
    fill: "currentColor",
    fillRule: "evenodd",
    content: (_id: string) => (
      <>
        <path d="M6.469 8.776L16.512 23h-4.464L2.005 8.776H6.47zm-.004 7.9l2.233 3.164L6.467 23H2l4.465-6.324zM22 2.582V23h-3.659V7.764L22 2.582zM22 1l-9.952 14.095-2.233-3.163L17.533 1H22z" />
      </>
    ),
  },
  fireworks: {
    viewBox: "0 0 24 24",
    fill: "none",
    content: (_id: string) => (
      <>
        <path
          clipRule="evenodd"
          d="M14.8 5l-2.801 6.795L9.195 5H7.397l3.072 7.428a1.64 1.64 0 003.038.002L16.598 5H14.8zm1.196 10.352l5.124-5.244-.699-1.669-5.596 5.739a1.664 1.664 0 00-.343 1.807 1.642 1.642 0 001.516 1.012L16 17l8-.02-.699-1.669-7.303.041h-.002zM2.88 10.104l.699-1.669 5.596 5.739c.468.479.603 1.189.343 1.807a1.643 1.643 0 01-1.516 1.012l-8-.018-.002.002.699-1.669 7.303.042-5.122-5.246z"
          fill={sourceColors.color21}
          fillRule="evenodd"
        />
      </>
    ),
  },
  huggingface: {
    viewBox: "0 0 24 24",
    fill: "none",
    content: (_id: string) => (
      <>
        <path
          d="M2.25 11.535c0-3.407 1.847-6.554 4.844-8.258a9.822 9.822 0 019.687 0c2.997 1.704 4.844 4.851 4.844 8.258 0 5.266-4.337 9.535-9.687 9.535S2.25 16.8 2.25 11.535z"
          fill={sourceColors.color22}
        />
        <path
          d="M11.938 20.086c4.797 0 8.687-3.829 8.687-8.551 0-4.722-3.89-8.55-8.687-8.55-4.798 0-8.688 3.828-8.688 8.55 0 4.722 3.89 8.55 8.688 8.55z"
          fill={sourceColors.color23}
        />
        <path
          d="M11.875 15.113c2.457 0 3.25-2.156 3.25-3.263 0-.576-.393-.394-1.023-.089-.582.283-1.365.675-2.224.675-1.798 0-3.25-1.693-3.25-.586 0 1.107.79 3.263 3.25 3.263h-.003z"
          fill={sourceColors.color24}
        />
        <path
          d="M14.76 9.21c.32.108.445.753.767.585.447-.233.707-.708.659-1.204a1.235 1.235 0 00-.879-1.059 1.262 1.262 0 00-1.33.394c-.322.384-.377.92-.14 1.36.153.283.638-.177.925-.079l-.002.003zm-5.887 0c-.32.108-.448.753-.768.585a1.226 1.226 0 01-.658-1.204c.048-.495.395-.913.878-1.059a1.262 1.262 0 011.33.394c.322.384.377.92.14 1.36-.152.283-.64-.177-.925-.079l.003.003zm1.12 5.34a2.166 2.166 0 011.325-1.106c.07-.02.144.06.219.171l.192.306c.069.1.139.175.209.175.074 0 .15-.074.223-.172l.205-.302c.08-.11.157-.188.234-.165.537.168.986.536 1.25 1.026.932-.724 1.275-1.905 1.275-2.633 0-.508-.306-.426-.81-.19l-.616.296c-.52.24-1.148.48-1.824.48-.676 0-1.302-.24-1.823-.48l-.589-.283c-.52-.248-.838-.342-.838.177 0 .703.32 1.831 1.187 2.56l.18.14z"
          fill={sourceColors.color25}
        />
        <path
          d="M17.812 10.366a.806.806 0 00.813-.8c0-.441-.364-.8-.813-.8a.806.806 0 00-.812.8c0 .442.364.8.812.8zm-11.624 0a.806.806 0 00.812-.8c0-.441-.364-.8-.812-.8a.806.806 0 00-.813.8c0 .442.364.8.813.8zM4.515 13.073c-.405 0-.765.162-1.017.46a1.455 1.455 0 00-.333.925 1.801 1.801 0 00-.485-.074c-.387 0-.737.146-.985.409a1.41 1.41 0 00-.2 1.722 1.302 1.302 0 00-.447.694c-.06.222-.12.69.2 1.166a1.267 1.267 0 00-.093 1.236c.238.533.81.958 1.89 1.405l.24.096c.768.3 1.473.492 1.478.494.89.243 1.808.375 2.732.394 1.465 0 2.513-.443 3.115-1.314.93-1.342.842-2.575-.274-3.763l-.151-.154c-.692-.684-1.155-1.69-1.25-1.912-.195-.655-.71-1.383-1.562-1.383-.46.007-.889.233-1.15.605-.25-.31-.495-.553-.715-.694a1.87 1.87 0 00-.993-.312zm14.97 0c.405 0 .767.162 1.017.46.216.262.333.588.333.925.158-.047.322-.071.487-.074.388 0 .738.146.985.409a1.41 1.41 0 01.2 1.722c.22.178.377.422.445.694.06.222.12.69-.2 1.166.244.37.279.836.093 1.236-.238.533-.81.958-1.889 1.405l-.239.096c-.77.3-1.475.492-1.48.494-.89.243-1.808.375-2.732.394-1.465 0-2.513-.443-3.115-1.314-.93-1.342-.842-2.575.274-3.763l.151-.154c.695-.684 1.157-1.69 1.252-1.912.195-.655.708-1.383 1.56-1.383.46.007.889.233 1.15.605.25-.31.495-.553.718-.694.244-.162.523-.265.814-.3l.176-.012z"
          fill={sourceColors.color22}
        />
        <path
          d="M9.785 20.132c.688-.994.638-1.74-.305-2.667-.945-.928-1.495-2.288-1.495-2.288s-.205-.788-.672-.714c-.468.074-.81 1.25.17 1.971.977.721-.195 1.21-.573.534-.375-.677-1.405-2.416-1.94-2.751-.532-.332-.907-.148-.782.541.125.687 2.357 2.35 2.14 2.707-.218.362-.983-.42-.983-.42S2.953 14.9 2.43 15.46c-.52.558.398 1.026 1.7 1.803 1.308.778 1.41.985 1.225 1.28-.187.295-3.07-2.1-3.34-1.083-.27 1.011 2.943 1.304 2.745 2.006-.2.7-2.265-1.324-2.685-.537-.425.79 2.913 1.718 2.94 1.725 1.075.276 3.813.859 4.77-.522zm4.432 0c-.687-.994-.64-1.74.305-2.667.943-.928 1.493-2.288 1.493-2.288s.205-.788.675-.714c.465.074.807 1.25-.17 1.971-.98.721.195 1.21.57.534.377-.677 1.407-2.416 1.94-2.751.532-.332.91-.148.782.541-.125.687-2.355 2.35-2.137 2.707.215.362.98-.42.98-.42S21.05 14.9 21.57 15.46c.52.558-.395 1.026-1.7 1.803-1.308.778-1.408.985-1.225 1.28.187.295 3.07-2.1 3.34-1.083.27 1.011-2.94 1.304-2.743 2.006.2.7 2.263-1.324 2.685-.537.423.79-2.912 1.718-2.94 1.725-1.077.276-3.815.859-4.77-.522z"
          fill={sourceColors.color23}
        />
      </>
    ),
  },
  groq: {
    viewBox: "0 0 24 24",
    fill: "currentColor",
    fillRule: "evenodd",
    content: (_id: string) => (
      <>
        <path d="M12.036 2c-3.853-.035-7 3-7.036 6.781-.035 3.782 3.055 6.872 6.908 6.907h2.42v-2.566h-2.292c-2.407.028-4.38-1.866-4.408-4.23-.029-2.362 1.901-4.298 4.308-4.326h.1c2.407 0 4.358 1.915 4.365 4.278v6.305c0 2.342-1.944 4.25-4.323 4.279a4.375 4.375 0 01-3.033-1.252l-1.851 1.818A7 7 0 0012.029 22h.092c3.803-.056 6.858-3.083 6.879-6.816v-6.5C18.907 4.963 15.817 2 12.036 2z" />
      </>
    ),
  },
  together: {
    viewBox: "0 0 24 24",
    fill: "none",
    content: (_id: string) => (
      <>
        <path
          d="M23.197 4.503A6 6 0 0015 2.307a5.973 5.973 0 00-2.995 4.933l5.996.008v.515h-5.996c.039.937.298 1.87.8 2.74a6 6 0 1010.39-6z"
          fill={sourceColors.color26}
        />
        <path
          d="M.805 4.5A6 6 0 003 12.697a5.972 5.972 0 005.77.127L5.779 7.627l.446-.257 2.997 5.192A6 6 0 10.804 4.5z"
          fill={sourceColors.color27}
        />
        <path
          d="M12 23.894a6 6 0 005.999-6c0-2.13-1.1-3.996-2.775-5.06l-3.005 5.189-.444-.258 2.997-5.192A6 6 0 1012 23.894z"
          fill={sourceColors.color28}
        />
      </>
    ),
  },
  gemini: {
    viewBox: "0 0 24 24",
    fill: "none",
    content: (id: string) => (
      <>
        <path
          d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z"
          fill={sourceColors.color29}
        />
        <path
          d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z"
          fill={`url(#gemini-0-${id})`}
        />
        <path
          d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z"
          fill={`url(#gemini-1-${id})`}
        />
        <path
          d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z"
          fill={`url(#gemini-2-${id})`}
        />
        <defs>
          <linearGradient
            gradientUnits="userSpaceOnUse"
            id={`gemini-0-${id}`}
            x1="7"
            x2="11"
            y1="15.5"
            y2="12"
          >
            <stop stopColor={sourceColors.color30} />
            <stop offset="1" stopColor={sourceColors.color30} stopOpacity="0" />
          </linearGradient>
          <linearGradient
            gradientUnits="userSpaceOnUse"
            id={`gemini-1-${id}`}
            x1="8"
            x2="11.5"
            y1="5.5"
            y2="11"
          >
            <stop stopColor={sourceColors.color31} />
            <stop offset="1" stopColor={sourceColors.color31} stopOpacity="0" />
          </linearGradient>
          <linearGradient
            gradientUnits="userSpaceOnUse"
            id={`gemini-2-${id}`}
            x1="3.5"
            x2="17.5"
            y1="13.5"
            y2="12"
          >
            <stop stopColor={sourceColors.color32} />
            <stop
              offset=".46"
              stopColor={sourceColors.color32}
              stopOpacity="0"
            />
          </linearGradient>
        </defs>
      </>
    ),
  },
  nvidia: {
    viewBox: "0 0 24 24",
    fill: "none",
    content: (_id: string) => (
      <>
        <path
          d="M10.212 8.976V7.62c.127-.01.256-.017.388-.021 3.596-.117 5.957 3.184 5.957 3.184s-2.548 3.647-5.282 3.647a3.227 3.227 0 01-1.063-.175v-4.109c1.4.174 1.681.812 2.523 2.258l1.873-1.627a4.905 4.905 0 00-3.67-1.846 6.594 6.594 0 00-.729.044m0-4.476v2.025c.13-.01.259-.019.388-.024 5.002-.174 8.261 4.226 8.261 4.226s-3.743 4.69-7.643 4.69c-.338 0-.675-.031-1.007-.092v1.25c.278.038.558.057.838.057 3.629 0 6.253-1.91 8.794-4.169.421.347 2.146 1.193 2.501 1.564-2.416 2.083-8.048 3.763-11.24 3.763-.308 0-.603-.02-.894-.048V19.5H24v-15H10.21zm0 9.756v1.068c-3.356-.616-4.287-4.21-4.287-4.21a7.173 7.173 0 014.287-2.138v1.172h-.005a3.182 3.182 0 00-2.502 1.178s.615 2.276 2.507 2.931m-5.961-3.3c1.436-1.935 3.604-3.148 5.961-3.336V6.523C5.81 6.887 2 10.723 2 10.723s2.158 6.427 8.21 7.015v-1.166C5.77 16 4.25 10.958 4.25 10.958h-.002z"
          fill={sourceColors.color33}
          fillRule="nonzero"
        />
      </>
    ),
  },
  aws: {
    viewBox: "0 0 24 24",
    fill: "currentColor",
    fillRule: "evenodd",
    content: (_id: string) => (
      <>
        <path d="M6.763 11.212c0 .296.032.535.088.71.064.176.144.368.256.576.04.063.056.127.056.183 0 .08-.048.16-.152.24l-.503.335a.383.383 0 01-.208.072c-.08 0-.16-.04-.239-.112a2.47 2.47 0 01-.287-.375 6.18 6.18 0 01-.248-.471c-.622.734-1.405 1.101-2.347 1.101-.67 0-1.205-.191-1.596-.574-.39-.384-.59-.894-.59-1.533 0-.678.24-1.23.726-1.644.487-.415 1.133-.623 1.955-.623.272 0 .551.024.846.064.296.04.6.104.918.176v-.583c0-.607-.127-1.03-.375-1.277-.255-.248-.686-.367-1.3-.367-.28 0-.568.031-.863.103-.295.072-.583.16-.862.272a2.4 2.4 0 01-.28.104.488.488 0 01-.127.023c-.112 0-.168-.08-.168-.247v-.391c0-.128.016-.224.056-.28a.597.597 0 01.224-.167 4.577 4.577 0 011.005-.36 4.84 4.84 0 011.246-.151c.95 0 1.644.216 2.091.647.44.43.662 1.085.662 1.963v2.586h.016zm-3.24 1.214c.263 0 .534-.048.822-.144a1.78 1.78 0 00.758-.51 1.27 1.27 0 00.272-.512c.047-.191.08-.423.08-.694v-.335a6.66 6.66 0 00-.735-.136 6.02 6.02 0 00-.75-.048c-.535 0-.926.104-1.19.32-.263.215-.39.518-.39.917 0 .375.095.655.295.846.191.2.47.296.838.296zm6.41.862c-.144 0-.24-.024-.304-.08-.064-.048-.12-.16-.168-.311L7.586 6.726a1.398 1.398 0 01-.072-.32c0-.128.064-.2.191-.2h.783c.151 0 .255.025.31.08.065.048.113.16.16.312l1.342 5.284 1.245-5.284c.04-.16.088-.264.151-.312a.549.549 0 01.32-.08h.638c.152 0 .256.025.32.08.063.048.12.16.151.312l1.261 5.348 1.381-5.348c.048-.16.104-.264.16-.312a.52.52 0 01.311-.08h.743c.127 0 .2.065.2.2 0 .04-.009.08-.017.128a1.137 1.137 0 01-.056.2l-1.923 6.17c-.048.16-.104.263-.168.311a.51.51 0 01-.303.08h-.687c-.15 0-.255-.024-.32-.08-.063-.056-.119-.16-.15-.32L12.32 7.747l-1.23 5.14c-.04.16-.087.264-.15.32-.065.056-.177.08-.32.08l-.686.001zm10.256.215c-.415 0-.83-.048-1.229-.143-.399-.096-.71-.2-.918-.32-.128-.071-.215-.151-.247-.223a.563.563 0 01-.048-.224v-.407c0-.167.064-.247.183-.247.048 0 .096.008.144.024.048.016.12.048.2.08.271.12.566.215.878.279.32.064.63.096.95.096.502 0 .894-.088 1.165-.264a.86.86 0 00.415-.758.777.777 0 00-.215-.559c-.144-.151-.416-.287-.807-.415l-1.157-.36c-.583-.183-1.014-.454-1.277-.813a1.902 1.902 0 01-.4-1.158c0-.335.073-.63.216-.886.144-.255.335-.479.575-.654.24-.184.51-.32.83-.415.32-.096.655-.136 1.006-.136.175 0 .36.008.535.032.183.024.35.056.518.088.16.04.312.08.455.127.144.048.256.096.336.144a.69.69 0 01.24.2.43.43 0 01.071.263v.375c0 .168-.064.256-.184.256a.83.83 0 01-.303-.096 3.652 3.652 0 00-1.532-.311c-.455 0-.815.071-1.062.223-.248.152-.375.383-.375.71 0 .224.08.416.24.567.16.152.454.304.877.44l1.134.358c.574.184.99.44 1.237.767.247.327.367.702.367 1.117 0 .343-.072.655-.207.926a2.157 2.157 0 01-.583.703c-.248.2-.543.343-.886.447-.36.111-.734.167-1.142.167z" />
        <path
          d="M.378 15.475c3.384 1.963 7.56 3.153 11.877 3.153 2.914 0 6.114-.607 9.06-1.852.44-.2.814.287.383.607-2.626 1.94-6.442 2.969-9.722 2.969-4.598 0-8.74-1.7-11.87-4.526-.247-.223-.024-.527.272-.351zm23.531-.2c.287.36-.08 2.826-1.485 4.007-.215.184-.423.088-.327-.151l.175-.439c.343-.88.802-2.198.52-2.555-.336-.43-2.22-.207-3.074-.103-.255.032-.295-.192-.063-.36 1.5-1.053 3.967-.75 4.254-.399z"
          fill={sourceColors.color34}
        />
      </>
    ),
  },
  cohere: {
    viewBox: "0 0 24 24",
    fill: "none",
    content: (_id: string) => (
      <>
        <path
          clipRule="evenodd"
          d="M8.128 14.099c.592 0 1.77-.033 3.398-.703 1.897-.781 5.672-2.2 8.395-3.656 1.905-1.018 2.74-2.366 2.74-4.18A4.56 4.56 0 0018.1 1H7.549A6.55 6.55 0 001 7.55c0 3.617 2.745 6.549 7.128 6.549z"
          fill={sourceColors.color35}
          fillRule="evenodd"
        />
        <path
          clipRule="evenodd"
          d="M9.912 18.61a4.387 4.387 0 012.705-4.052l3.323-1.38c3.361-1.394 7.06 1.076 7.06 4.715a5.104 5.104 0 01-5.105 5.104l-3.597-.001a4.386 4.386 0 01-4.386-4.387z"
          fill={sourceColors.color36}
          fillRule="evenodd"
        />
        <path
          d="M4.776 14.962A3.775 3.775 0 001 18.738v.489a3.776 3.776 0 007.551 0v-.49a3.775 3.775 0 00-3.775-3.775z"
          fill={sourceColors.color37}
        />
      </>
    ),
  },
  qwen: {
    viewBox: "0 0 24 24",
    fill: "none",
    content: (id: string) => (
      <>
        <path
          d="M12.604 1.34c.393.69.784 1.382 1.174 2.075a.18.18 0 00.157.091h5.552c.174 0 .322.11.446.327l1.454 2.57c.19.337.24.478.024.837-.26.43-.513.864-.76 1.3l-.367.658c-.106.196-.223.28-.04.512l2.652 4.637c.172.301.111.494-.043.77-.437.785-.882 1.564-1.335 2.34-.159.272-.352.375-.68.37-.777-.016-1.552-.01-2.327.016a.099.099 0 00-.081.05 575.097 575.097 0 01-2.705 4.74c-.169.293-.38.363-.725.364-.997.003-2.002.004-3.017.002a.537.537 0 01-.465-.271l-1.335-2.323a.09.09 0 00-.083-.049H4.982c-.285.03-.553-.001-.805-.092l-1.603-2.77a.543.543 0 01-.002-.54l1.207-2.12a.198.198 0 000-.197 550.951 550.951 0 01-1.875-3.272l-.79-1.395c-.16-.31-.173-.496.095-.965.465-.813.927-1.625 1.387-2.436.132-.234.304-.334.584-.335a338.3 338.3 0 012.589-.001.124.124 0 00.107-.063l2.806-4.895a.488.488 0 01.422-.246c.524-.001 1.053 0 1.583-.006L11.704 1c.341-.003.724.032.9.34zm-3.432.403a.06.06 0 00-.052.03L6.254 6.788a.157.157 0 01-.135.078H3.253c-.056 0-.07.025-.041.074l5.81 10.156c.025.042.013.062-.034.063l-2.795.015a.218.218 0 00-.2.116l-1.32 2.31c-.044.078-.021.118.068.118l5.716.008c.046 0 .08.02.104.061l1.403 2.454c.046.081.092.082.139 0l5.006-8.76.783-1.382a.055.055 0 01.096 0l1.424 2.53a.122.122 0 00.107.062l2.763-.02a.04.04 0 00.035-.02.041.041 0 000-.04l-2.9-5.086a.108.108 0 010-.113l.293-.507 1.12-1.977c.024-.041.012-.062-.035-.062H9.2c-.059 0-.073-.026-.043-.077l1.434-2.505a.107.107 0 000-.114L9.225 1.774a.06.06 0 00-.053-.031zm6.29 8.02c.046 0 .058.02.034.06l-.832 1.465-2.613 4.585a.056.056 0 01-.05.029.058.058 0 01-.05-.029L8.498 9.841c-.02-.034-.01-.052.028-.054l.216-.012 6.722-.012z"
          fill={`url(#qwen-0-${id})`}
          fillRule="nonzero"
        />
        <defs>
          <linearGradient id={`qwen-0-${id}`} x1="0%" x2="100%" y1="0%" y2="0%">
            <stop
              offset="0%"
              stopColor={sourceColors.color38}
              stopOpacity=".84"
            />
            <stop
              offset="100%"
              stopColor={sourceColors.color39}
              stopOpacity=".84"
            />
          </linearGradient>
        </defs>
      </>
    ),
  },
  kimi: {
    viewBox: "0 0 24 24",
    fill: "none",
    content: (_id: string) => (
      <>
        <path
          d="M21.846 0a1.923 1.923 0 110 3.846H20.15a.226.226 0 01-.227-.226V1.923C19.923.861 20.784 0 21.846 0z"
          fill={sourceColors.color40}
        />
        <path
          d="M11.065 11.199l7.257-7.2c.137-.136.06-.41-.116-.41H14.3a.164.164 0 00-.117.051l-7.82 7.756c-.122.12-.302.013-.302-.179V3.82c0-.127-.083-.23-.185-.23H3.186c-.103 0-.186.103-.186.23V19.77c0 .128.083.23.186.23h2.69c.103 0 .186-.102.186-.23v-3.25c0-.069.025-.135.069-.178l2.424-2.406a.158.158 0 01.205-.023l6.484 4.772a7.677 7.677 0 003.453 1.283c.108.012.2-.095.2-.23v-3.06c0-.117-.07-.212-.164-.227a5.028 5.028 0 01-2.027-.807l-5.613-4.064c-.117-.078-.132-.279-.028-.381z"
          fill="currentColor"
        />
      </>
    ),
  },
  openrouter: {
    viewBox: "0 0 24 24",
    fill: "currentColor",
    fillRule: "evenodd",
    content: (_id: string) => (
      <>
        <path d="M18.654 3.87a5.087 5.087 0 110 10.174L23.7 19.09c.64.641.187 1.737-.72 1.737H8.48a8.479 8.479 0 010-16.958h10.175zM8.479 7.26a5.087 5.087 0 100 10.176 5.087 5.087 0 000-10.175z" />
      </>
    ),
  },
  alibaba: {
    viewBox: "0 0 24 24",
    fill: "none",
    content: (_id: string) => (
      <>
        <path
          d="M24 14.014c-2.8 1.512-5.62 2.896-8.759 3.524-.7.139-1.476.139-2.187.043-.678-.085-1.017-.682-.776-1.31.23-.585.536-1.181.93-1.671.852-1.065 1.814-2.034 2.678-3.088a15.75 15.75 0 001.422-2.054c.306-.511.164-1.129-.372-1.384-.897-.437-1.859-.745-2.81-1.075-.11-.043-.274.074-.492.149.273.244.47.425.743.67-2.821.48-5.49 1.16-8.08 2.098-.012.053-.033.095-.023.117.383.585.208 1.032-.35 1.394a2.365 2.365 0 00-.568.522c1.706.5 3.226.213 4.68-.735-.087-.127-.175-.244-.262-.372.546.096.874.394.918.862.011.107-.054.213-.087.32-.077-.086-.175-.17-.24-.267-.045-.064-.056-.138-.088-.245-1.728 1.15-3.587 1.438-5.632.842 0 .404-.022.745.011 1.075.022.287-.098.415-.36.564-.591.362-1.204.735-1.696 1.214-.59.585-.371 1.299.427 1.597.907.34 1.859.35 2.81.234 1.126-.139 2.23-.32 3.456-.49-1.433.67-2.844 1.14-4.33 1.33-1.04.14-2.078.214-3.106-.084-1.476-.415-2.133-1.501-1.75-2.96.361-1.363 1.236-2.449 2.176-3.45 3.139-3.332 7.108-5.024 11.7-5.365 1.072-.074 2.155.064 3.16.511 1.411.639 2.002 1.99 1.313 3.354-.448.905-1.072 1.735-1.695 2.555-.612.809-1.301 1.554-1.946 2.331-.186.234-.361.48-.503.745-.274.5-.088.83.492.778 1.213-.118 2.45-.213 3.62-.511 1.716-.437 3.389-1.054 5.084-1.597.175-.043.339-.107.492-.17z"
          fill={sourceColors.color42}
          fillRule="evenodd"
        />
      </>
    ),
  },
  ollama: {
    viewBox: "0 0 24 24",
    fill: "currentColor",
    fillRule: "evenodd",
    content: (_id: string) => (
      <>
        <path d="M7.905 1.09c.216.085.411.225.588.41.295.306.544.744.734 1.263.191.522.315 1.1.362 1.68a5.054 5.054 0 012.049-.636l.051-.004c.87-.07 1.73.087 2.48.474.101.053.2.11.297.17.05-.569.172-1.134.36-1.644.19-.52.439-.957.733-1.264a1.67 1.67 0 01.589-.41c.257-.1.53-.118.796-.042.401.114.745.368 1.016.737.248.337.434.769.561 1.287.23.934.27 2.163.115 3.645l.053.04.026.019c.757.576 1.284 1.397 1.563 2.35.435 1.487.216 3.155-.534 4.088l-.018.021.002.003c.417.762.67 1.567.724 2.4l.002.03c.064 1.065-.2 2.137-.814 3.19l-.007.01.01.024c.472 1.157.62 2.322.438 3.486l-.006.039a.651.651 0 01-.747.536.648.648 0 01-.54-.742c.167-1.033.01-2.069-.48-3.123a.643.643 0 01.04-.617l.004-.006c.604-.924.854-1.83.8-2.72-.046-.779-.325-1.544-.8-2.273a.644.644 0 01.18-.886l.009-.006c.243-.159.467-.565.58-1.12a4.229 4.229 0 00-.095-1.974c-.205-.7-.58-1.284-1.105-1.683-.595-.454-1.383-.673-2.38-.61a.653.653 0 01-.632-.371c-.314-.665-.772-1.141-1.343-1.436a3.288 3.288 0 00-1.772-.332c-1.245.099-2.343.801-2.67 1.686a.652.652 0 01-.61.425c-1.067.002-1.893.252-2.497.703-.522.39-.878.935-1.066 1.588a4.07 4.07 0 00-.068 1.886c.112.558.331 1.02.582 1.269l.008.007c.212.207.257.53.109.785-.36.622-.629 1.549-.673 2.44-.05 1.018.186 1.902.719 2.536l.016.019a.643.643 0 01.095.69c-.576 1.236-.753 2.252-.562 3.052a.652.652 0 01-1.269.298c-.243-1.018-.078-2.184.473-3.498l.014-.035-.008-.012a4.339 4.339 0 01-.598-1.309l-.005-.019a5.764 5.764 0 01-.177-1.785c.044-.91.278-1.842.622-2.59l.012-.026-.002-.002c-.293-.418-.51-.953-.63-1.545l-.005-.024a5.352 5.352 0 01.093-2.49c.262-.915.777-1.701 1.536-2.269.06-.045.123-.09.186-.132-.159-1.493-.119-2.73.112-3.67.127-.518.314-.95.562-1.287.27-.368.614-.622 1.015-.737.266-.076.54-.059.797.042zm4.116 9.09c.936 0 1.8.313 2.446.855.63.527 1.005 1.235 1.005 1.94 0 .888-.406 1.58-1.133 2.022-.62.375-1.451.557-2.403.557-1.009 0-1.871-.259-2.493-.734-.617-.47-.963-1.13-.963-1.845 0-.707.398-1.417 1.056-1.946.668-.537 1.55-.849 2.485-.849zm0 .896a3.07 3.07 0 00-1.916.65c-.461.37-.722.835-.722 1.25 0 .428.21.829.61 1.134.455.347 1.124.548 1.943.548.799 0 1.473-.147 1.932-.426.463-.28.7-.686.7-1.257 0-.423-.246-.89-.683-1.256-.484-.405-1.14-.643-1.864-.643zm.662 1.21l.004.004c.12.151.095.37-.056.49l-.292.23v.446a.375.375 0 01-.376.373.375.375 0 01-.376-.373v-.46l-.271-.218a.347.347 0 01-.052-.49.353.353 0 01.494-.051l.215.172.22-.174a.353.353 0 01.49.051zm-5.04-1.919c.478 0 .867.39.867.871a.87.87 0 01-.868.871.87.87 0 01-.867-.87.87.87 0 01.867-.872zm8.706 0c.48 0 .868.39.868.871a.87.87 0 01-.868.871.87.87 0 01-.867-.87.87.87 0 01.867-.872zM7.44 2.3l-.003.002a.659.659 0 00-.285.238l-.005.006c-.138.189-.258.467-.348.832-.17.692-.216 1.631-.124 2.782.43-.128.899-.208 1.404-.237l.01-.001.019-.034c.046-.082.095-.161.148-.239.123-.771.022-1.692-.253-2.444-.134-.364-.297-.65-.453-.813a.628.628 0 00-.107-.09L7.44 2.3zm9.174.04l-.002.001a.628.628 0 00-.107.09c-.156.163-.32.45-.453.814-.29.794-.387 1.776-.23 2.572l.058.097.008.014h.03a5.184 5.184 0 011.466.212c.086-1.124.038-2.043-.128-2.722-.09-.365-.21-.643-.349-.832l-.004-.006a.659.659 0 00-.285-.239h-.004z" />
      </>
    ),
  },
  mistral: {
    viewBox: "0 0 24 24",
    fill: "none",
    content: (_id: string) => (
      <>
        <path
          d="M3.428 3.4h3.429v3.428H3.428V3.4zm13.714 0h3.43v3.428h-3.43V3.4z"
          fill={sourceColors.color43}
        />
        <path
          d="M3.428 6.828h6.857v3.429H3.429V6.828zm10.286 0h6.857v3.429h-6.857V6.828z"
          fill={sourceColors.color44}
        />
        <path
          d="M3.428 10.258h17.144v3.428H3.428v-3.428z"
          fill={sourceColors.color45}
        />
        <path
          d="M3.428 13.686h3.429v3.428H3.428v-3.428zm6.858 0h3.429v3.428h-3.429v-3.428zm6.856 0h3.43v3.428h-3.43v-3.428z"
          fill={sourceColors.color46}
        />
        <path
          d="M0 17.114h10.286v3.429H0v-3.429zm13.714 0H24v3.429H13.714v-3.429z"
          fill={sourceColors.color47}
        />
      </>
    ),
  },
  cerebras: {
    viewBox: "0 0 24 24",
    fill: "currentColor",
    content: (_id: string) => (
      <>
        <path
          clipRule="evenodd"
          d="M14.121 2.701a9.299 9.299 0 000 18.598V22.7c-5.91 0-10.7-4.791-10.7-10.701S8.21 1.299 14.12 1.299V2.7zm4.752 3.677A7.353 7.353 0 109.42 17.643l-.901 1.074a8.754 8.754 0 01-1.08-12.334 8.755 8.755 0 0112.335-1.08l-.901 1.075zm-2.255.844a5.407 5.407 0 00-5.048 9.563l-.656 1.24a6.81 6.81 0 016.358-12.043l-.654 1.24zM14.12 8.539a3.46 3.46 0 100 6.922v1.402a4.863 4.863 0 010-9.726v1.402z"
          fill={sourceColors.color48}
          fillRule="evenodd"
        />
        <path d="M15.407 10.836a2.24 2.24 0 00-.51-.409 1.084 1.084 0 00-.544-.152c-.255 0-.483.047-.684.14a1.58 1.58 0 00-.84.912c-.074.203-.11.416-.11.631 0 .218.036.43.11.631a1.594 1.594 0 00.84.913c.2.093.43.14.684.14.216 0 .417-.046.602-.135.188-.09.35-.225.475-.392l.928 1.006c-.14.14-.3.261-.482.363a3.367 3.367 0 01-1.083.38c-.17.026-.317.04-.44.04a3.315 3.315 0 01-1.182-.21 2.825 2.825 0 01-.961-.597 2.816 2.816 0 01-.644-.929 2.987 2.987 0 01-.238-1.21c0-.444.08-.847.238-1.21.15-.35.368-.666.643-.929.278-.261.605-.464.962-.596a3.315 3.315 0 011.182-.21c.355 0 .712.068 1.072.204.361.138.685.36.944.649l-.962.97z" />
      </>
    ),
  },
  minimax: {
    viewBox: "0 0 24 24",
    fill: "none",
    content: (id: string) => (
      <>
        <defs>
          <linearGradient
            id={`minimax-0-${id}`}
            x1="0%"
            x2="100.182%"
            y1="50.057%"
            y2="50.057%"
          >
            <stop offset="0%" stopColor={sourceColors.color49} />
            <stop offset="100%" stopColor={sourceColors.color50} />
          </linearGradient>
        </defs>
        <path
          d="M16.278 2c1.156 0 2.093.927 2.093 2.07v12.501a.74.74 0 00.744.709.74.74 0 00.743-.709V9.099a2.06 2.06 0 012.071-2.049A2.06 2.06 0 0124 9.1v6.561a.649.649 0 01-.652.645.649.649 0 01-.653-.645V9.1a.762.762 0 00-.766-.758.762.762 0 00-.766.758v7.472a2.037 2.037 0 01-2.048 2.026 2.037 2.037 0 01-2.048-2.026v-12.5a.785.785 0 00-.788-.753.785.785 0 00-.789.752l-.001 15.904A2.037 2.037 0 0113.441 22a2.037 2.037 0 01-2.048-2.026V18.04c0-.356.292-.645.652-.645.36 0 .652.289.652.645v1.934c0 .263.142.506.372.638.23.131.514.131.744 0a.734.734 0 00.372-.638V4.07c0-1.143.937-2.07 2.093-2.07zm-5.674 0c1.156 0 2.093.927 2.093 2.07v11.523a.648.648 0 01-.652.645.648.648 0 01-.652-.645V4.07a.785.785 0 00-.789-.78.785.785 0 00-.789.78v14.013a2.06 2.06 0 01-2.07 2.048 2.06 2.06 0 01-2.071-2.048V9.1a.762.762 0 00-.766-.758.762.762 0 00-.766.758v3.8a2.06 2.06 0 01-2.071 2.049A2.06 2.06 0 010 12.9v-1.378c0-.357.292-.646.652-.646.36 0 .653.29.653.646V12.9c0 .418.343.757.766.757s.766-.339.766-.757V9.099a2.06 2.06 0 012.07-2.048 2.06 2.06 0 012.071 2.048v8.984c0 .419.343.758.767.758.423 0 .766-.339.766-.758V4.07c0-1.143.937-2.07 2.093-2.07z"
          fill={`url(#minimax-0-${id})`}
          fillRule="nonzero"
        />
      </>
    ),
  },
  azure: {
    viewBox: "0 0 24 24",
    fill: "none",
    content: (id: string) => (
      <>
        <path
          d="M7.242 1.613A1.11 1.11 0 018.295.857h6.977L8.03 22.316a1.11 1.11 0 01-1.052.755h-5.43a1.11 1.11 0 01-1.053-1.466L7.242 1.613z"
          fill={`url(#azure-0-${id})`}
        />
        <path
          d="M18.397 15.296H7.4a.51.51 0 00-.347.882l7.066 6.595c.206.192.477.298.758.298h6.226l-2.706-7.775z"
          fill={sourceColors.color51}
        />
        <path
          d="M15.272.857H7.497L0 23.071h7.775l1.596-4.73 5.068 4.73h6.665l-2.707-7.775h-7.998L15.272.857z"
          fill={`url(#azure-1-${id})`}
        />
        <path
          d="M17.193 1.613a1.11 1.11 0 00-1.052-.756h-7.81.035c.477 0 .9.304 1.052.756l6.748 19.992a1.11 1.11 0 01-1.052 1.466h-.12 7.895a1.11 1.11 0 001.052-1.466L17.193 1.613z"
          fill={`url(#azure-2-${id})`}
        />
        <defs>
          <linearGradient
            gradientUnits="userSpaceOnUse"
            id={`azure-0-${id}`}
            x1="8.247"
            x2="1.002"
            y1="1.626"
            y2="23.03"
          >
            <stop stopColor={sourceColors.color52} />
            <stop offset="1" stopColor={sourceColors.color53} />
          </linearGradient>
          <linearGradient
            gradientUnits="userSpaceOnUse"
            id={`azure-1-${id}`}
            x1="14.042"
            x2="12.324"
            y1="15.302"
            y2="15.888"
          >
            <stop stopOpacity=".3" />
            <stop offset=".071" stopOpacity=".2" />
            <stop offset=".321" stopOpacity=".1" />
            <stop offset=".623" stopOpacity=".05" />
            <stop offset="1" stopOpacity="0" />
          </linearGradient>
          <linearGradient
            gradientUnits="userSpaceOnUse"
            id={`azure-2-${id}`}
            x1="12.841"
            x2="20.793"
            y1="1.626"
            y2="22.814"
          >
            <stop stopColor={sourceColors.color54} />
            <stop offset="1" stopColor={sourceColors.color55} />
          </linearGradient>
        </defs>
      </>
    ),
  },
} satisfies Record<string, BrandAsset>;

export type Brand = keyof typeof brandAssets;
