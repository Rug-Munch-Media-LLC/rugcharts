import TrendingRow from '@/components/trending/TrendingRow'
import type { TrendingItem, TrendingWindow } from '@/services/trendingApi'

/** Ranked board table. Columns collapse progressively; rank/price/score never hide. */
export default function TrendingBoardTable({ items, window }: { items: TrendingItem[]; window: TrendingWindow }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed border-collapse">
        <caption className="sr-only">
          Trending tokens ranked by activity over the last {window}. Missing metrics are marked with a dash that names
          the reason.
        </caption>
        <thead>
          <tr className="text-[9px] uppercase tracking-wider text-text-secondary border-b border-[rgba(139,92,246,0.12)]">
            <th scope="col" className="w-8 py-2 pl-2 pr-1 text-right font-bold">
              #
            </th>
            <th scope="col" className="py-2 pr-2 text-left font-bold">
              Token
            </th>
            <th scope="col" className="w-[5.5rem] py-2 px-2 text-right font-bold">
              Price
            </th>
            <th scope="col" className="w-[4.5rem] py-2 px-2 text-right font-bold">
              {window}
            </th>
            <th scope="col" className="hidden sm:table-cell w-[5rem] py-2 px-2 text-right font-bold">
              Volume
            </th>
            <th scope="col" className="hidden lg:table-cell w-[5.5rem] py-2 px-2 text-right font-bold">
              Liquidity
            </th>
            <th scope="col" className="hidden xl:table-cell w-[5rem] py-2 px-2 text-right font-bold">
              MCap
            </th>
            <th scope="col" className="hidden lg:table-cell w-[6rem] py-2 px-2 text-right font-bold">
              Buys / Sells
            </th>
            <th scope="col" className="hidden lg:table-cell w-[6rem] py-2 px-2 text-right font-bold">
              Bonding
            </th>
            <th scope="col" className="w-[8.5rem] py-2 px-2 text-right font-bold">
              Score
            </th>
            <th scope="col" className="hidden xl:table-cell w-[6rem] py-2 pl-2 pr-2 text-right font-bold">
              Source
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <TrendingRow key={`${item.chain}:${item.token}`} item={item} rank={idx + 1} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
