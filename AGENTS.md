# AGENTS.md - IOOO Admin Codex Guide

Tài liệu này giúp Codex làm việc trong `manufacturing-execution-admin` nhanh và đúng pattern. Giữ file ngắn, ưu tiên luật có tác động trực tiếp tới chất lượng code.

---

## 1. Quy trình làm việc

- Đọc file gần nhất trong cùng module trước khi sửa: page, part, element, hook, api, interface, enum, constant liên quan.
- Nếu cần đối chiếu API contract, chỉ đọc source/backend hoặc payload builder liên quan. Không sửa source khác trừ khi user yêu cầu rõ.
- Ưu tiên pattern đang có trong module hơn tạo abstraction mới.
- Nếu FE cần field backend chưa trả, nêu rõ giới hạn contract hoặc hiển thị empty theo yêu cầu. Không tự sửa backend.
- Giữ thay đổi nhỏ, đúng phạm vi task. Không refactor lan rộng khi không cần.
- Tuyệt đối không đươc sử dụng lệnh git

---

## 2. Stack bắt buộc

- UI: Material UI + `sevago-library`.
- Data fetching: `SWR`.
- Form: `Formik` + `Yup`.
- Table: `TableComponent` + `Column<T>[]`.
- API: service layer trong `src/apis/...`, dùng `axiosRequest` từ `@/lib/api-client`.
- Status: `TagElement` + `COLOR_SYSTEM.tag[statusCode]` + enum/constant chung.
- Text/i18n: không hardcode user-facing text nếu màn đó đã dùng i18n.
- Constant/message: chỉ tách ra constant chung khi dùng lặp lại nhiều nơi hoặc có business meaning rõ; text chỉ
  dùng một lần thì để inline tại nơi sử dụng.

---

## 3. Luật bắt buộc

- Dùng `TableComponent`; không tự dựng bảng bằng MUI `Table`.
- Dùng `Formik + Yup`; không dùng `react-hook-form`, `zod`.
- Dùng `SWR`; không dùng `@tanstack/react-query`.
- Gọi API qua service trong `src/apis/...`; không gọi `axios`, `fetch`, `axiosRequest` trực tiếp trong component.
- Trong component, import API theo namespace từ `@/apis` và gọi dạng `workCenterApi.getListWorkCenter(...)`.
- Dùng named export cho component/file mới; không dùng default export.
- Dùng `TypographyOneLine`; không dùng `Typography variant`.
- Dùng `StackRow`, `StackRowAlignCenter`, `StackJustCenter`, ... thay cho `Stack direction="row"`.
- Dùng helper có sẵn trong `sevago-library` hoặc `src/lib` trước khi viết helper mới.
- Thông báo/hướng dẫn trong màn hình dùng `NoteComponent` từ `sevago-library`, không dùng MUI `Alert`.
- Render data theo đường thẳng: dùng trực tiếp array/object API; chỉ `map` ở JSX để render list hoặc khi component bắt buộc shape khác.
- Không tự `filter`/`sort`/dedupe/normalize response ở component nếu backend đã trả đúng contract. Nếu cần dữ liệu khác, ưu tiên chỉnh request/API contract hoặc ghi rõ lý do.

---

## 4. Luật không dùng

- Không dùng HTML tag trực tiếp trong JSX: `div`, `span`, `p`, `label`, `button`, `form`, `ul`, `li`, ...
- Không dùng Tailwind `className`.
- Không đưa server state vào Zustand.
- Không `throw new Error(...)` trong component để xử lý response false/guard; snackbar rồi `return`.
- Không tự chặn lỗi nghiệp vụ/API bằng snackbar custom nếu backend đã có validation/message; gửi request và hiển thị message từ response/catch.
- Service API trả nguyên response theo contract; không tự thêm `throw` cho `succeeded === false` hoặc thiếu `data`. Nơi dùng xử lý response/message theo pattern của màn.
- Không tạo formatter/helper riêng trong feature nếu có helper chung.
- Không tự viết helper normalize/map label/map status nếu API đã trả data hoặc đã có enum/options/constant chung.
- Không viết fallback chain kiểu `apiField ?? dataField ?? localField` khi backend đã có contract field rõ.
- Không hardcode business status trong component, ví dụ `status === 7`; bổ sung enum/constant chung sau khi đối chiếu backend.
- Không tạo row trung gian cho table nếu API đã trả entity đúng shape.
- Không map qua map lại hoặc tạo `Map`/`reduce`/summary object khi chỉ render danh sách/bảng/card đơn giản.
- Không viết pipeline kiểu `Array.from(new Set(response.flatMap(...).filter(...).map(...)))` trong component để tự xử lý lại dữ liệu backend.
- Không tạo constant như `EMPTY_VALUE = "--"`; dùng `stringUtil.checkEmptyText`.
- Không check rỗng thủ công kiểu `value === "" || value === undefined`, `value === null`; dùng `stringUtil.isEmpty`, `stringUtil.checkEmptyText` hoặc helper chung.
- Không tự ép kiểu dữ liệu backend trong component bằng `Number(...)`, `String(...)`, `parseInt`, `parseFloat` nếu contract đã có type rõ; dùng trực tiếp value backend trả về.
- Không tự format/làm tròn số backend bằng `.toFixed(...)` trong component nếu user không yêu cầu rõ; nếu cần format hiển thị, dùng helper chung như `numberUtil.formatNumber`/formatter chung.
- Không dùng `.trim()` để check empty trong component; dùng `stringUtil.isEmpty(value)`.
- Không đưa `showSnackbar` vào dependency array của `useMemo`, `useCallback`, `useEffect`.
- Không dùng `void handleSubmit()`; gọi trực tiếp `handleSubmit()`.

---

## 5. Styling

Luôn ưu tiên token từ `sevago-library`.

```tsx
// Sai
sx={{ mt: 2, mb: 2, borderRadius: 6, fontWeight: 600, color: "primary.main" }}

// Đúng
sx={{
  m: STYLE.PADDING_GAP_ITEM,
  borderRadius: STYLE.BORDER_RADIUS_ELEMENT,
  ...STYLE.TYPOGRAPHY.textSm.semiBold,
  color: COLOR.BRAND[500],
}}
```

- Không dùng shorthand một phía trong `sx` như `mt`, `mb`, `pt`, `pl` nếu có token/layout chung phù hợp.
- Không hardcode radius, font weight, color palette khi `STYLE`/`COLOR` đã có.

---

## 6. Sevago-library ưu tiên dùng

Trước khi tự viết UI/helper mới, kiểm tra component/util có sẵn trong `sevago-library` và usage gần nhất trong repo.

- Layout/wrapper: `WrapperElement`, `WrapperContentElement`, `WrapperCenterElement`, `CollapsibleSection`, `SectionTitle`, `BreadcrumbElement`, `DefaultLayout`.
- Stack/layout: `StackRow`, `StackRowAlignCenter`, `StackRowAlignCenterJustBetween`, `StackRowAlignCenterJustCenter`, `StackAlignCenterJustCenter`, `StackJustBetween`, `StackWrap`.
- Button/action/dialog: `ButtonElement`, `ButtonIconElement`, `ButtonUploadFileElement`, `DialogElement`, `TooltipOnHoverElement`, `TooltipOnClickElement`.
- Form fields: `TextFieldElement`, `TextFieldNumberElement`, `TextFieldWeightNumberElement`, `TextFieldDateElement`, `TextFieldDateRangeElement`, `TextFieldDateTimeElement`, `TextFieldMonthYearElement`, `TextFieldTimeElement`, `TextFieldTimeRangeElement`, `TextFieldHourMinuteElement`, `TextFieldSelectSearchObjectElement`.
- Form controls: `CheckboxElement`, `RadioElement`, `RadioGroupElement`, `SwitchElement`, `SwitchContentElement`.
- Table/list/data: `TableComponent`, `TableCollapseComponent`, `PaginationElement`, `Column<T>`, `EmptyComponent`, `LoadingComponent`.
- Status/display: `TagElement`, `TabsComponent`, `TabsBadgeComponent`, `TabsBadgeSubsVerticalComponent`, `TypographyOneLine`, `TypographyInfoRow`, `TypographyGridInfoRow`, `TypographyFilter`, `TimeAgoComponent`.
- Visual/icon/media: `IconElement`, `IconContentElement`, `ListIconContentElement`, `AvatarElement`, `AvatarGroupElement`, `ImageElement`, `ImageContentCaptionComponent`, `ImageGalleryElement`.
- Hooks/types: `useTabsSelected`, `OrderType`, `SnackbarType`, `SizeProps`, `VariantProps`, `TabSizeProps`, `FilterMap`, `FilterValue`, `FilterRule`, `BaseEntity`, `ResList`, `PageOptions`.
- Constants/util namespaces: `COLOR`, `STYLE`, `OTHER`, `APPS`, `Mode`, `Environment`, `stringUtil`, `numberUtil`, `timeUtil`, `otherUtil`, `arrayUtil`, `objectUtil`, `fileUtil`, `delayUtil`.

Nếu không chắc component nào phù hợp, dùng `rg "ComponentName" src` hoặc xem màn tương tự trước khi tự dựng bằng MUI/HTML.

---

## 7. Import và format

- Giữ nguyên thứ tự, vị trí và cách trình bày import hiện có. Không tự sắp xếp, gom nhóm hoặc di chuyển import khi sửa tính năng.
- Chỉ thêm import cần cho code mới, hoặc xóa import không còn dùng do chính thay đổi đang làm; giữ nguyên các import còn lại.
- Không tự chạy organize imports, formatter, `npm run format` hoặc auto-fix chỉ để chỉnh trình bày, trừ khi người dùng yêu cầu rõ. Kiểm tra lint/format ở chế độ chỉ đọc được phép.
- Người dùng tự xử lý sắp xếp import và chạy `npm run format` trong `package.json`; không tạo diff trình bày ngoài phạm vi yêu cầu.

---

## 8. Feature structure

```txt
my-feature/
├── page.tsx
├── my-feature.interface.ts
├── my-feature.enum.ts
├── my-feature.constant.ts
├── parts/
└── elements/
    ├── create-my.element.tsx
    ├── update-my.element.tsx
    └── delete-my.element.tsx
```

- `page.tsx`: layout chính, state filter, SWR list, table, pagination.
- `parts/`: section UI lớn hoặc workflow con.
- `elements/`: dialog/modal/element cục bộ.
- Màn detail/xem chi tiết dạng full-page phải render như page/part, không bọc trong `DialogElement`. Chỉ dùng dialog cho popup thật sự.
- `*.constant.ts`: Yup schema, static config có business meaning.
- `*.enum.ts`: field name, action, status dùng lại.
- `*.interface.ts`: props/state/config object-shaped.
- Hạn chế `*.utils.ts`; chỉ tạo khi logic thật sự thuộc feature và không có helper chung.
- Biểu thức/hàm ngắn chỉ dùng một nơi viết trực tiếp tại nơi dùng; không tách util hoặc file riêng cho wrapper đơn giản. Chỉ cân nhắc tách helper khi dùng lại hoặc có logic đủ phức tạp.
- Dùng trực tiếp component thư viện; không tạo element/file chỉ để bọc một component và truyền props/handler đơn giản.
- Element/dialog phức tạp phải tách folder cùng tên và chia sub-element riêng. File chính chỉ orchestration data/state/SWR và compose UI.
- Workflow dài phải tách hook thao tác, table và dialog theo trách nhiệm; bỏ state/helper/guard trùng trước khi tách, không chỉ chuyển nguyên file dài sang hook.
- Với Formik/Yup, đặt schema trong `*.constant.ts`; nếu schema phụ thuộc props/state, export factory function nhận params.

---

## 9. Type và API contract

- Dùng `interface` cho props, state, config, object-shaped data.
- Không dùng `type` alias cho object-shaped data trong code mới.
- Kể cả object nội bộ/runtime helper cũng dùng `interface`; chỉ dùng `type` cho union, primitive alias,
  mapped/utility type thật sự cần.
- Dùng string `enum` cho field/action/status dùng lại.
- Nếu enum value giống field name, dùng trực tiếp enum sau khi guard type; không viết mapper `switch` dài.
- Nếu cần metadata cho enum, dùng `Record<MyEnum, Metadata>`.
- Title của enum đặt cùng file `*.enum.ts`, export dạng `MyEnumTitle: Record<MyEnum, string>` để dùng chung; không tạo bảng label riêng trong component.
- Hook trả object dùng interface khai báo rõ trong `*.interface.ts`; không dùng `export type ... = ReturnType<typeof use...>` để suy ra contract.
- Khi nhiều màn cùng tải một dữ liệu và xử lý loading/error giống nhau, dùng hook chung; không chép lại khối SWR, guard và thông báo ở từng component. Giữ phần ghép dữ liệu cho form nhiều Bag trong hook của feature, chỉ biến đổi khi form cần shape khác API.
- Trước khi thêm/sửa request/response interface, đối chiếu DTO/result contract/payload builder backend. Không suy đoán type từ UI.
- Không khai báo `| null` trong interface TypeScript, kể cả `field?: T | null`.
- `field: T`: backend luôn trả property với giá trị dùng được.
- `field?: T`: backend có thể không trả property hoặc trả `null`; code phải guard bằng optional chaining/nullish check.
- Nullable C# như `Guid?`, `int?`, `long?`, `decimal?`, `bool?`, `string?` map sang `field?: T`.
- Collection backend luôn serialize `[]` thì dùng `field: T[]`; chỉ thêm `?` khi contract thực sự có thể thiếu/null.

---

## 10. API service

Tất cả API đặt trong `src/apis/<feature>/<feature>.api.ts`.

```tsx
import { axiosRequest } from "@/lib/api-client";
import { BaseResponse } from "@/types";

import { MyFilterRequest, MyModel } from "./my-feature.entities";

export const filterMy = async (body: MyFilterRequest): Promise<BaseResponse<MyModel[]>> => {
  return await axiosRequest.post("my-resource/filter", body);
};
```

Component chỉ gọi service qua namespace import từ `@/apis`.

```tsx
import { workCenterApi } from "@/apis";

const response = await workCenterApi.getListWorkCenter(params);
```

Nếu tạo API service mới, export namespace trong `src/apis/index.ts`.

---

## 11. Table, SWR, filter

- Filter header .NET dùng trực tiếp `useDotNetColumnFilterTable` của `sevago-library`; hook tự tải hết options, không ghép lại nút Tải thêm hoặc data hook cục bộ. Khi lưu/khôi phục URL, giữ thứ tự áp dụng trong `params.filters` để options cột sau chịu filter cột trước; dùng `readColumnFilterQuery`, không dựng lại theo thứ tự cột.
- `rows` nhận trực tiếp array entity từ API nếu shape đã đúng.
- Format dữ liệu trong `Column<T>.render`.
- Không dùng `Column<T>.render` chỉ để bọc `stringUtil.checkEmptyText(value)`; `TableComponent` đã xử lý empty text mặc định cho cell. Nếu cần nested field/format/custom UI, render trả trực tiếp value đã lấy/đã format hoặc JSX cần hiển thị.
- Column lớn đặt trong `useMemo`.
- Không viết inline render quá dài trong column; tách element/helper nếu render phức tạp.
- Với detail table, render trực tiếp list từ API; không thêm client-side search/filter/sort/pagination nếu backend nên xử lý.
- SWR list key phải chứa các params ảnh hưởng data.
- Nếu params đã là object filter ổn định trong state, dùng trực tiếp object đó trong SWR key như `["key", screenState.params]`; không tách từng field, không tự `.join(",")` array chỉ để tạo key.
- Không tạo state phụ chỉ để mirror filter input nếu `screenState.params` đã là nguồn dữ liệu đủ dùng. Giữ một nguồn state cho filter/list params.
- Dropdown SWR chỉ fetch khi mở dialog/dropdown nếu phù hợp; dùng `revalidateOnFocus: false`, `revalidateIfStale: false`, `shouldRetryOnError: false` cho options ít thay đổi.
- Search input phải debounce trước khi đổi SWR key hoặc gọi API. Delay mặc định: `300ms`.
- Filter nhỏ viết thẳng trong element bằng key string trực tiếp. Chỉ tách enum/helper/subcomponent khi filter phức tạp hoặc dùng lại nhiều nơi.
- Dropdown trong filter ưu tiên dùng trực tiếp object API làm `options`; chỉ `map` khi component bắt buộc shape khác.
- Dropdown/options từ BE phải dùng trực tiếp danh sách BE trả về, giữ nguyên thứ tự và nội dung. Không tự `filter`/`sort`/lọc active/lọc theo group ở FE; nếu cần điều kiện khác, truyền request param cho BE hoặc yêu cầu BE bổ sung contract.
- Với `TextFieldDateRangeElement`, không tự `dayjs.extend(customParseFormat)`, không tự ghép `T00:00:00`/`T23:59:59.999`; dùng giá trị component trả ra và helper `timeUtil` khi cần.
- Với tabs, dùng `TabsComponent` và `Object.values(Enum)` nếu không cần custom order/filter.
- Không export thêm `EnumOptions` nếu nó chỉ lặp lại toàn bộ enum. Nếu enum có `ALL`, dùng trực tiếp `MyEnum.ALL`.

---

## 12. Form dialog

- Dùng `DialogElement` + `Formik` + `Yup`.
- Create/update/delete phải gọi API service, không gọi trực tiếp `axiosRequest`.
- Submit success: snackbar success, `await onSuccess?.()`, close/reset form phù hợp.
- Submit error: snackbar error bằng `otherUtil.getErrorMessage(error)`.
- Button submit trong dialog gọi `handleSubmit()` sau `event.preventDefault()`.
- Delete dialog có state loading, chặn close khi đang xoá.
- FE chỉ validate lỗi tương tác/form bắt buộc trước submit; lỗi nghiệp vụ để backend trả message.

---

## 13. Sevago helpers hay dùng

- `stringUtil.checkEmptyText(value)` để hiển thị empty text ngoài cell của `TableComponent`.
- `stringUtil.isEmpty(value)` để guard empty.
- `stringUtil.extractNumberAtStartString(value)` khi cần lấy number đầu chuỗi.
- `numberUtil.formatNumber(value)` để format số.
- `timeUtil.getDateTime(new Date())`, `timeUtil.formatRange(...)` cho thời gian.
- `src/lib/format.ts` cho formatter/chuyển đổi hiển thị chung như date input, Unix time, number text, duration text trước khi tạo helper mới.
- `otherUtil.getErrorMessage(error)` cho catch error.
- `arrayUtil`, `objectUtil`, `fileUtil`, `delayUtil` trước khi tự viết helper mới.
- `STYLE` và `COLOR` cho spacing, radius, typography, palette.

---

## 14. Checklist trước khi trả code

- Không có HTML tag trực tiếp, Tailwind `className`, MUI `Table` tự dựng.
- Không có `react-hook-form`, `zod`, `react-query`.
- Không có API call trực tiếp trong component.
- Không có default export cho code mới.
- Không có `Typography variant`, `Stack direction="row"`.
- Không có `showSnackbar` trong dependency array.
- Không có `void handleSubmit()`.
- Không hardcode user-facing text nếu màn đang dùng i18n.
- Search input đã debounce.
- Table rows dùng entity trực tiếp nếu có thể.
- Data transform đơn giản, không helper/summary/Map trung gian khi không cần.
- Không fallback chain đoán field API khi contract rõ.
- Helper/formatter dùng từ `sevago-library` hoặc `src/lib`.
- Interface API đã đối chiếu backend, không có `| null`, không thêm `?` phòng hờ.
- Element/dialog phức tạp đã tách sub-element, không dồn toàn bộ render vào một file lớn.

---

## 15. Tablet Web Serial Scale Flow

- Cấu hình trường cân OUT lấy từ `GET /work-center-cache/{wcCode}` qua `workCenterApi`, không lấy/fallback từ `workCenterSnapshot` hoặc WorkCenter nhúng trong Bag. Chỉ đổi nguồn `scaleConfig`; các cờ nghiệp vụ khác giữ nguồn hiện tại nếu không có yêu cầu riêng.

Ap dung cho cac dialog tablet dung `useSharedWebSerialScale`, nhat la IN/OUT bag MC/worker.

- Dung pattern don gian nhu `WorkerJobsTabletInDialog`: khi dialog `open`, field dang duoc chon co dung can, va `scale?.reading?.value` co gia tri thi set thang reading vao field do.
- Neu chi co mot field dung can, dung boolean guard ro nghia nhu `selectedBagUsesLiveWeight`.
- Neu co nhieu textfield co the nhan can, dung danh sach field can san co lam whitelist, vi du `WORK_CENTER_OUT_SCALE_WEIGHT_FIELDS`, roi chon target theo field dang focus hoac default field dau tien.
- Khong tao map/reduce/summary object rieng chi de biet field nao dung can neu da co constant field config san co.
- Khong dung `lastScaleReadingRef`/`currentScaleReadingReceivedAtRef`/check `receivedAt` chi de chan set lai cung reading; dependency `scale?.reading?.value` la du cho flow hien tai.
- Field input can nen goi setter hien co cua form, vi du `setWeight`, `setFieldValue`, `setNumberValue`, de khong bo qua logic dirty/validation san co.
- Dependency array uu tien ngan gon theo gia tri that su lam thay doi UI:

```tsx
useEffect(() => {
  if (!open || !selectedScaleTargetName) return;
  const reading = scale?.reading;
  if (!reading?.value) return;

  setFieldValue(selectedScaleTargetName, reading.value);
}, [open, scale?.reading?.value, selectedScaleTargetName, setFieldValue]);
```

Voi worker OUT, neu chi can nhan can khi cong doan co material control:

```tsx
useEffect(() => {
  if (!open || !dataRequiresScale || !selectedScaleTargetName) return;
  const reading = scale?.reading;
  if (!reading?.value) return;

  setNumberValue(selectedScaleTargetName, reading.value);
}, [dataRequiresScale, open, scale?.reading?.value, selectedScaleTargetName, setNumberValue]);
```

---

## 16. Shared Web Serial Scale Setup Cho App/Don Vi Khac

Khi ap dung can Web Serial shared sang app/module khac, phai lam du 3 lop: provider, floating tool connect can, va form/dialog dang ky nhan reading. Thieu mot lop thi flow se khong hoan chinh.

### 16.1. Route config bat can

Tao constant route/path duoc dung can, dat gan route/navigation constant cua app. Neu app da co `route.constant.ts` chua route tree va import layout/screen, khong import nguoc `ROUTE` vao `route.meta.ts` vi de tao vong import runtime (`ROUTE` -> `DashboardLayout` -> `route.meta` -> `ROUTE`).

Pattern uu tien cho source moi:

- Tao constant path rieng, vi du `route-path.constant.ts`.
- `route.constant.ts` va `route.meta.ts` cung import path constant nay.
- `route.meta.ts` chi build `SCALE_ENABLED_NAV_HREFS`, khong import screen/layout/`ROUTE`.

```tsx
// route-path.constant.ts
export const MATERIAL_ROUTE_PATH = {
  material: "material",
  receiveMaterial: "receive",
  handleMaterial: "handle-material",
} as const;
```

```tsx
// route.constant.ts
import { MATERIAL_ROUTE_PATH } from "./route-path.constant";

export const ROUTE = {
  MATERIAL_CONTROL: {
    path: "/",
    children: {
      material: {
        path: MATERIAL_ROUTE_PATH.material,
        children: {
          receiveMaterial: { path: MATERIAL_ROUTE_PATH.receiveMaterial },
        },
      },
    },
  },
};
```

```tsx
// route.meta.ts
import { MATERIAL_ROUTE_PATH } from "./route-path.constant";

const joinRoute = (...paths: string[]) =>
  paths
    .map((path) => path.replace(/^\/|\/$/g, ""))
    .filter(Boolean)
    .join("/")
    .replace(/^/, "/");

// Router se dung can.
export const SCALE_ENABLED_NAV_HREFS = [
  joinRoute(MATERIAL_ROUTE_PATH.material, MATERIAL_ROUTE_PATH.receiveMaterial),
  joinRoute(MATERIAL_ROUTE_PATH.handleMaterial),
] as const;
```

Chon path cha neu tat ca route con deu can can. Helper `isSevagoPathnameEnabled` match exact, endsWith va prefix con, nen path cha nhu `/manufacturing-plan/gold-orders/casting-order` se bao gom ca detail route ben duoi.

### 16.2. Boc app bang `SevagoProvider` co pathname

Provider la lop tao shared WebSerialScale context. Khong co provider thi `FloatingToolsElement`, `useSharedWebSerialScale`, `useWebSerialScaleTargetRegistration` khong co context can de dung.

Rule bat buoc:

- Chi boc `SevagoProvider` mot lan o root app/provider gan `BrowserRouter`.
- Voi React Router/Vite, uu tien tach `AppProviders` trong `main.tsx`/entrypoint, dat ben trong `BrowserRouter` de lay `useLocation()`. Khong dua `SevagoProvider` vao `App.tsx`.
- Truyen du `webSerialScaleEnabledPathnames={SCALE_ENABLED_NAV_HREFS}` va `webSerialScalePathname={pathname}`.
- Go bo provider long trong `App.tsx`, layout, page, dialog.
- Khong dung `webSerialScaleAutoConnectAuthorized` global trong provider long; route whitelist moi la lop bat/tat can.

React Router:

```tsx
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { createRoot } from "react-dom/client";
import { BrowserRouter, useLocation } from "react-router-dom";
import { SevagoProvider } from "sevago-library";
import { SWRConfig } from "swr";
import App from "./App";
import { SCALE_ENABLED_NAV_HREFS } from "./router/route.meta";

const AppProviders = () => {
  const { pathname } = useLocation();

  return (
    <SevagoProvider webSerialScaleEnabledPathnames={SCALE_ENABLED_NAV_HREFS} webSerialScalePathname={pathname}>
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <SWRConfig value={{ revalidateOnFocus: false, keepPreviousData: true, errorRetryCount: 0 }}>
          <App />
        </SWRConfig>
      </LocalizationProvider>
    </SevagoProvider>
  );
};

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <AppProviders />
  </BrowserRouter>,
);
```

Next.js:

```tsx
const pathname = usePathname();

<SevagoProvider webSerialScaleEnabledPathnames={SCALE_ENABLED_NAV_HREFS} webSerialScalePathname={pathname}>
  {children}
</SevagoProvider>;
```

`webSerialScaleEnabledPathnames` giup provider chi bat can o route can thiet. Khi co route config, provider mac dinh auto connect authorized port va auto switch active window theo route.

### 16.3. Render `FloatingToolsElement` trong layout

Floating tool la UI nut noi de user connect/disconnect can. No khong thay the provider; no chi dieu khien shared scale context cua provider.

Chi bat floating scale tool khi pathname match `SCALE_ENABLED_NAV_HREFS`. Khong render `<FloatingToolsElement enableScale />` co dinh tren moi route vi app co the giu quyen can sai man hinh.

```tsx
import { FloatingToolsElement, providerUntil } from "sevago-library";
import { useLocation } from "react-router-dom";
import { SCALE_ENABLED_NAV_HREFS } from "../router/route.meta";

export const DashboardLayout = ({ children }: { children?: React.ReactNode }) => {
  const { pathname } = useLocation();
  const enableScale = providerUntil.useSevagoPathnameEnabled(SCALE_ENABLED_NAV_HREFS, pathname);

  return (
    <>
      {children}
      <FloatingToolsElement enableFinishGoodGallery={false} enableScale={enableScale} />
    </>
  );
};
```

Neu app co `axiosProductManagement` dung cho gallery thanh pham, truyen nhu execution-admin:

```tsx
<FloatingToolsElement axiosProductManagement={axiosProductManagement} enableScale={enableScale} />
```

Neu app khong co product-management axios rieng, tat gallery de tranh goi sai API:

```tsx
<FloatingToolsElement enableFinishGoodGallery={false} enableScale={enableScale} />
```

### 16.4. Form/input nhan can trong source moi

Voi app/source moi, uu tien dung `TextFieldWeightNumberElement` tu `sevago-library` cho field trong luong. Khong copy lai component local, khong tu viet `safeParseNumber`, `formatDisplay`, throttle/ref chong lap reading, hoac hook scale rieng neu flow chi la "can va ghi vao o input".

```tsx
import { TextFieldWeightNumberElement } from "sevago-library";

<TextFieldWeightNumberElement name="weight" value={values.weight} onChange={handleChange} />;
```

Rule cho `TextFieldWeightNumberElement`:

- `TextFieldWeightNumberElement` tu dang ky target voi shared Web Serial Scale provider; man hinh chi can render input dung route da bat can.
- Chi input dang focus moi nhan reading; input `disabled` khong nhan can.
- Gia tri tu can luon bi cat ve 4 so thap phan, khong lam tron. Vi du `0.15315` phai ghi thanh `0.1531`.
- `TextFieldWeightNumberElement` đã đưa số âm về 0 và cắt 4 số lẻ. Feature dùng trực tiếp giá trị component trả ra; không viết lại parse/truncate/clamp, hệ số `10 ** 4`/scaled integer hoặc formatter cân riêng.
- Không dùng `round` cho số cân hoặc hiệu OUT − IN; tính trực tiếp và dùng formatter chung khi hiển thị.
- Không tự regex/parse `rawLine` để suy đoán cân ổn định hoặc thêm guard/thông báo dư thừa. Dùng trạng thái/giá trị thư viện cung cấp; guard đơn giản thì `return` khi không đủ điều kiện.
- Flow cần Enter chốt cân phải tách `onChange` cập nhật live với xử lý phím Enter. Đọc implementation callback; không tự coi `onEnterConfirm` là keydown Enter nếu thư viện đang gọi nó lúc cập nhật reading.
- Khong phu thuoc `decimalScale` caller truyen vao de xu ly reading tu can; `TextFieldWeightNumberElement` phai giu output can o 4 so thap phan.
- Khi dung Formik hoac state thuong, truyen `name`, `value`, `onChange` nhu `TextFieldNumberElement`; khong bypass dirty/validation bang cach set DOM value truc tiep.
- Neu source cu dang co `TextFieldWeightNumberElement` local, sau khi nang `sevago-library` thi thay bang import tu library va xoa component local neu khong con usage.
- Tranh dung `WebSerialScaleControllerElement` trong tung dialog/form moi. Connect/disconnect can thuoc `FloatingToolsElement`, context thuoc `SevagoProvider`.
- Chi tao hook rieng voi `useSharedWebSerialScale`/`useWebSerialScaleTargetRegistration` khi flow nghiep vu dac biet khong the bieu dien bang `TextFieldWeightNumberElement`, vi du tablet IN/OUT co whitelist nhieu target nhu muc 15.

Checklist khi ap dung can cho source moi:

- Them route/path vao `SCALE_ENABLED_NAV_HREFS`.
- Root provider phai truyen `webSerialScaleEnabledPathnames` va pathname hien tai.
- Layout phai render `FloatingToolsElement` voi `enableScale` tinh bang `providerUntil.useSevagoPathnameEnabled(...)`.
- Tat `enableFinishGoodGallery` neu app khong co product-management axios rieng.
- Form dung `TextFieldWeightNumberElement` tu `sevago-library` cho field can.
- Chay targeted lint/build sau khi sua.
