import { BTUserBasicSummaryInfo, BTOwnerInfo, BTDocumentInfo, BTGlobalTreeNodesInfo, BTGlobalTreeMagicNodeInfo } from "onshape-typescript-fetch";

/**
 * DocumentSummary type for information common between BTDocumentInfo and BTGlobalTreeNodes
 */

export interface DocumentSummary {
    canMove?: boolean;
    createdAt?: Date;
    createdBy?: BTUserBasicSummaryInfo;
    description?: string;
    href?: string;
    id?: string;
    isContainer?: boolean;
    isEnterpriseOwned?: boolean;
    isMutable?: boolean;
    modifiedAt?: Date;
    modifiedBy?: BTUserBasicSummaryInfo;
    name?: string;
    owner?: BTOwnerInfo;
    projectId?: string;
    resourceType?: string;
    treeHref?: string;
    unparentHref?: string;
    viewRef?: string;
}

export class DocumentSummary {
    public static from(info: BTDocumentInfo | BTGlobalTreeMagicNodeInfo): DocumentSummary {
        const documentInfo: DocumentSummary = {}
        documentInfo.canMove = info.canMove;
        documentInfo.createdAt = info.createdAt;
        documentInfo.createdBy = info.createdBy;
        documentInfo.description = info.description;
        documentInfo.href = info.href;
        documentInfo.id = info.id;
        documentInfo.isContainer = info.isContainer;
        documentInfo.isEnterpriseOwned = info.isEnterpriseOwned;
        documentInfo.isMutable = info.isMutable;
        documentInfo.modifiedAt = info.modifiedAt;
        documentInfo.modifiedBy = info.modifiedBy;
        documentInfo.name = info.name;
        documentInfo.owner = info.owner;
        documentInfo.projectId = info.projectId;
        documentInfo.resourceType = info.resourceType;
        documentInfo.treeHref = info.treeHref;
        documentInfo.unparentHref = info.unparentHref;
        documentInfo.viewRef = info.viewRef;
        return documentInfo;
    }
}