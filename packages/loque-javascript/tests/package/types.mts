import loque, {
    Extractor,
    Locator,
    LocatorCollectionStatement,
    LocatorDocumentStatement,
    Updater,
    type ExtractedLoque,
    type LocatorStatements,
} from '@plurid/loque';

interface Document {
    id: string;
    value: string;
}

const data = { records: [{ id: '1', value: 'one' }] };
const statements: LocatorStatements = loque.locate('records.id:1');
const extracted: ExtractedLoque<Document> = loque.extract<Document, typeof data>(statements, data);
const id: string = extracted.data.id;
const cursor: number | undefined = extracted.cursor;
const empty: boolean = extracted.empty;
const updated: typeof data = loque.update(statements, data, { value: 'updated' });

const parsed: LocatorStatements = new Locator().parse('records.id:1');
const collection = new LocatorCollectionStatement('records');
const document = new LocatorDocumentStatement([{ key: 'id', value: '1', comparison: ':' }]);
const result: ExtractedLoque<Document> = new Extractor(statements, data).extract<Document>();
const updatedByClass: typeof data = new Updater(statements, data, { value: 'updated' }).result();

// @ts-expect-error The selected document's id remains a string.
const invalidId: number = extracted.data.id;
// @ts-expect-error A query must be a string or parsed locator statements.
loque.extract(123, data);

export { id, cursor, empty, updated, parsed, collection, document, result, updatedByClass, invalidId };
