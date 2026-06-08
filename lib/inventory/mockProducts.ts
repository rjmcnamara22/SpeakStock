import type { InventoryProduct } from "@/types/inventory";

export const mockProducts: InventoryProduct[] = [
  {
    id: "1",
    name: "Miller Lite Bottle",
    aliases: [
      "miller lite",
      "miller light",
      "miller",
      "millerlite",
      "miller lite bottle",
      "miller light bottle",
    ],
    squareCount: 97,
  },
  {
    id: "2",
    name: "Bud Light Bottle",
    aliases: [
      "bud light",
      "budlight",
      "bud",
      "bud lite",
      "bud light bottle",
      "bud lite bottle",
    ],
    squareCount: 74,
  },
  {
    id: "3",
    name: "Coors Light Bottle",
    aliases: [
      "coors light",
      "coors lite",
      "coors",
      "coorslight",
      "coors light bottle",
      "coors lite bottle",
    ],
    squareCount: 61,
  },
  {
    id: "4",
    name: "Pabst Blue Ribbon Can",
    aliases: [
      "pbr",
      "pabst",
      "pabst blue",
      "pabst blue ribbon",
      "pabst blue ribbon can",
    ],
    squareCount: 35,
  },
];
