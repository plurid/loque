// #region module
export interface LocatorDocument {
    type: 'document',
    key: string,
    value: string,
}


export interface LocatorCollection {
    type: 'collection',
    value: string,
}


export type Locator = LocatorDocument | LocatorCollection;
// #endregion module
