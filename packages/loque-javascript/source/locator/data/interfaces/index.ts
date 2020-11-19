// #region module
export interface LocatorDocument {
    type: 'document',
    key: string,
    value: string,
    comparison: 'equal' | 'greater_than' | 'less_than';
    cursor?: LocatorCursor;
}


export interface LocatorCursor {
    id?: string;
    value?: number;
    modifier?: 'all' | 'first' | 'last' | 'above' | 'below';
}


export interface LocatorCollection {
    type: 'collection',
    value: string,
}


export type Locator = LocatorDocument | LocatorCollection;
// #endregion module
