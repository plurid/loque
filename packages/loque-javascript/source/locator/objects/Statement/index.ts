// #region imports
    // #region external
    import {
        LocatorKey,
    } from '../../data/interfaces';
    // import Token from '../Token';
    // #endregion external
// #endregion imports



// #region module
export type LocatorStatements = (CollectionStatement | DocumentStatement)[];


export abstract class Statement {
    abstract accept<T>(
        visitor: Visitor<T>,
    ): T;
}


export interface Visitor<T> {
    visitCollectionStatement: (collectionStatement: CollectionStatement) => T;
    visitDocumentStatement: (documentStatement: DocumentStatement) => T;
}


export class CollectionStatement extends Statement {
    public name: string;

    constructor(
        name: string,
    ) {
        super();

        this.name = name;
    }

    accept<T>(
        visitor: Visitor<T>,
    ) {
        return visitor.visitCollectionStatement(this);
    }
}


export class DocumentStatement extends Statement {
    public keys: LocatorKey[];

    constructor(
        keys: LocatorKey[],
    ) {
        super();

        this.keys = keys;
    }

    accept<T>(
        visitor: Visitor<T>,
    ) {
        return visitor.visitDocumentStatement(this);
    }
}
// #endregion module
